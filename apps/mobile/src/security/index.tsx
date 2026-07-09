import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Crypto from "expo-crypto";
import * as SecureStore from "expo-secure-store";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import {
  bytesToHex,
  createConfiguredAppLockRecord,
  getPasscodeLockout,
  isConfiguredAppLockRecord,
  verifyConfiguredPasscode,
  type AppLockRecord,
} from "./app-lock";
import { createAppLockStore } from "./app-lock-store";

export type AppLockStatus =
  | "loading"
  | "unconfigured"
  | "configured"
  | "legacy-passcode-required"
  | "storage-error";

export type AppLockActionFailureReason =
  | "not-ready"
  | "not-configured"
  | "legacy-passcode-required"
  | "already-configured"
  | "invalid-passcode"
  | "incorrect"
  | "locked"
  | "storage-error";

export type AppLockActionResult =
  | { success: true }
  | { success: false; reason: AppLockActionFailureReason };

export type AppLockVerifyResult =
  | {
      success: true;
      lockedUntil: null;
      remainingAttempts: number;
    }
  | {
      success: false;
      reason: AppLockActionFailureReason;
      lockedUntil: number | null;
      remainingAttempts: number;
    };

export interface AppLockContextValue {
  /** False until SecureStore and the legacy migration have completed. */
  isHydrated: boolean;
  /** True for a valid passcode record or a protected legacy migration. */
  isEnabled: boolean;
  hasPasscode: boolean;
  /** Legacy biometric-only users must create a passcode before changing it. */
  legacyPasscodeRequired: boolean;
  biometricEnabled: boolean;
  /** Current passcode rate-limit state, if a passcode is configured. */
  lockout: { lockedUntil: number | null; remainingAttempts: number } | null;
  /** Fail closed in the gate when this is storage-error. */
  status: AppLockStatus;
  createPasscode: (passcode: string) => Promise<AppLockActionResult>;
  changePasscode: (
    currentPasscode: string,
    nextPasscode: string,
  ) => Promise<AppLockActionResult>;
  removePasscode: (passcode: string) => Promise<AppLockActionResult>;
  setBiometricEnabled: (enabled: boolean) => Promise<AppLockActionResult>;
  verifyPasscode: (passcode: string) => Promise<AppLockVerifyResult>;
}

const AppLockContext = createContext<AppLockContextValue | null>(null);

const SECURE_STORE_OPTIONS = {
  // Keep the verifier tied to this device and unavailable before the device
  // itself has been unlocked. Do not set requireAuthentication here: the app
  // needs to offer its own passcode fallback when biometrics are unavailable.
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
} as const;

const appLockStore = createAppLockStore(
  {
    getItem: (key) => SecureStore.getItemAsync(key, SECURE_STORE_OPTIONS),
    setItem: (key, value) =>
      SecureStore.setItemAsync(key, value, SECURE_STORE_OPTIONS),
    removeItem: (key) =>
      SecureStore.deleteItemAsync(key, SECURE_STORE_OPTIONS),
  },
  AsyncStorage,
);

function applyRecord(
  record: AppLockRecord | null,
  setRecord: (record: AppLockRecord | null) => void,
  recordRef: { current: AppLockRecord | null },
): void {
  recordRef.current = record;
  setRecord(record);
}

function appLockStatus(record: AppLockRecord | null): AppLockStatus {
  if (!record) {
    return "unconfigured";
  }

  return record.state === "configured"
    ? "configured"
    : "legacy-passcode-required";
}

async function createPasscodeSalt(): Promise<string> {
  return bytesToHex(await Crypto.getRandomBytesAsync(16));
}

export function AppLockProvider({ children }: { children: ReactNode }) {
  const [record, setRecord] = useState<AppLockRecord | null>(null);
  const [status, setStatus] = useState<AppLockStatus>("loading");
  const [isHydrated, setIsHydrated] = useState(false);
  const recordRef = useRef<AppLockRecord | null>(null);
  const hydratedRef = useRef(false);
  const operationQueueRef = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const loaded = await appLockStore.load();

        if (cancelled) {
          return;
        }

        if (loaded.state === "invalid-record") {
          setStatus("storage-error");
          return;
        }

        applyRecord(loaded.state === "record" ? loaded.record : null, setRecord, recordRef);
        setStatus(appLockStatus(loaded.state === "record" ? loaded.record : null));
      } catch {
        if (!cancelled) {
          setStatus("storage-error");
        }
      } finally {
        if (!cancelled) {
          hydratedRef.current = true;
          setIsHydrated(true);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const runExclusive = useCallback(<Result,>(
    operation: () => Promise<Result>,
  ): Promise<Result> => {
    const next = operationQueueRef.current.then(operation, operation);
    operationQueueRef.current = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  }, []);

  const persistRecord = useCallback(
    async (nextRecord: AppLockRecord): Promise<void> => {
      applyRecord(nextRecord, setRecord, recordRef);

      try {
        await appLockStore.save(nextRecord);
      } catch {
        setStatus("storage-error");
        throw new Error("Unable to persist app lock settings.");
      }
    },
    [],
  );

  const verifyPasscodeInternal = useCallback(
    async (passcode: string): Promise<AppLockVerifyResult> => {
      if (!hydratedRef.current) {
        return {
          success: false,
          reason: "not-ready",
          lockedUntil: null,
          remainingAttempts: 0,
        };
      }

      if (status === "storage-error") {
        return {
          success: false,
          reason: "storage-error",
          lockedUntil: null,
          remainingAttempts: 0,
        };
      }

      const currentRecord = recordRef.current;

      if (!currentRecord) {
        return {
          success: false,
          reason: "not-configured",
          lockedUntil: null,
          remainingAttempts: 0,
        };
      }

      if (!isConfiguredAppLockRecord(currentRecord)) {
        return {
          success: false,
          reason: "legacy-passcode-required",
          lockedUntil: null,
          remainingAttempts: 0,
        };
      }

      try {
        const verification = await verifyConfiguredPasscode(
          currentRecord,
          passcode,
        );

        if (verification.updatedRecord !== currentRecord) {
          await persistRecord(verification.updatedRecord);
        }

        if (verification.success) {
          return {
            success: true,
            lockedUntil: null,
            remainingAttempts: verification.remainingAttempts,
          };
        }

        return {
          success: false,
          reason: verification.reason,
          lockedUntil: verification.lockedUntil,
          remainingAttempts: verification.remainingAttempts,
        };
      } catch {
        return {
          success: false,
          reason: "storage-error",
          lockedUntil: null,
          remainingAttempts: 0,
        };
      }
    },
    [persistRecord, status],
  );

  const verifyPasscode = useCallback(
    (passcode: string) => runExclusive(() => verifyPasscodeInternal(passcode)),
    [runExclusive, verifyPasscodeInternal],
  );

  const createPasscode = useCallback(
    (passcode: string) =>
      runExclusive(async (): Promise<AppLockActionResult> => {
        if (!hydratedRef.current) {
          return { success: false, reason: "not-ready" };
        }

        if (status === "storage-error") {
          return { success: false, reason: "storage-error" };
        }

        if (
          recordRef.current !== null &&
          isConfiguredAppLockRecord(recordRef.current)
        ) {
          return { success: false, reason: "already-configured" };
        }

        try {
          const currentRecord = recordRef.current;
          const nextRecord = await createConfiguredAppLockRecord({
            passcode,
            salt: await createPasscodeSalt(),
            // New locks always begin with the app passcode. Biometrics are an
            // opt-in convenience after the user has confirmed they work on
            // this particular device; legacy users retain their prior choice.
            biometricEnabled: currentRecord?.biometricEnabled ?? false,
            createdAt: currentRecord?.createdAt,
          });

          await appLockStore.save(nextRecord);
          applyRecord(nextRecord, setRecord, recordRef);
          setStatus("configured");
          // The secure record is already live if this cleanup happens to fail;
          // retain the old flag rather than weakening legacy protection.
          await appLockStore.clearLegacyFlag().catch(() => undefined);
          return { success: true };
        } catch (error) {
          if (error instanceof Error && error.message.includes("Passcodes")) {
            return { success: false, reason: "invalid-passcode" };
          }

          setStatus("storage-error");
          return { success: false, reason: "storage-error" };
        }
      }),
    [runExclusive, status],
  );

  const changePasscode = useCallback(
    (currentPasscode: string, nextPasscode: string) =>
      runExclusive(async (): Promise<AppLockActionResult> => {
        const verification = await verifyPasscodeInternal(currentPasscode);

        if (!verification.success) {
          return { success: false, reason: verification.reason };
        }

        const currentRecord = recordRef.current;

        if (!currentRecord || !isConfiguredAppLockRecord(currentRecord)) {
          return { success: false, reason: "not-configured" };
        }

        try {
          const nextRecord = await createConfiguredAppLockRecord({
            passcode: nextPasscode,
            salt: await createPasscodeSalt(),
            biometricEnabled: currentRecord.biometricEnabled,
            createdAt: currentRecord.createdAt,
          });
          await persistRecord(nextRecord);
          return { success: true };
        } catch (error) {
          if (error instanceof Error && error.message.includes("Passcodes")) {
            return { success: false, reason: "invalid-passcode" };
          }

          return { success: false, reason: "storage-error" };
        }
      }),
    [runExclusive, verifyPasscodeInternal, persistRecord],
  );

  const removePasscode = useCallback(
    (passcode: string) =>
      runExclusive(async (): Promise<AppLockActionResult> => {
        const verification = await verifyPasscodeInternal(passcode);

        if (!verification.success) {
          return { success: false, reason: verification.reason };
        }

        try {
          // Retire the old value before deleting the secure record. If the
          // deletion fails, the valid passcode record remains in force.
          await appLockStore.clearLegacyFlag();
          await appLockStore.remove();
          applyRecord(null, setRecord, recordRef);
          setStatus("unconfigured");
          return { success: true };
        } catch {
          return { success: false, reason: "storage-error" };
        }
      }),
    [runExclusive, verifyPasscodeInternal],
  );

  const setBiometricEnabled = useCallback(
    (enabled: boolean) =>
      runExclusive(async (): Promise<AppLockActionResult> => {
        if (!hydratedRef.current) {
          return { success: false, reason: "not-ready" };
        }

        if (status === "storage-error") {
          return { success: false, reason: "storage-error" };
        }

        const currentRecord = recordRef.current;

        if (!currentRecord) {
          return { success: false, reason: "not-configured" };
        }

        if (!isConfiguredAppLockRecord(currentRecord)) {
          return { success: false, reason: "legacy-passcode-required" };
        }

        try {
          await persistRecord({
            ...currentRecord,
            biometricEnabled: enabled,
            updatedAt: Date.now(),
          });
          return { success: true };
        } catch {
          return { success: false, reason: "storage-error" };
        }
      }),
    [persistRecord, runExclusive, status],
  );

  const lockout = useMemo(() => {
    if (!record || !isConfiguredAppLockRecord(record)) {
      return null;
    }

    return getPasscodeLockout(record);
  }, [record]);

  const value = useMemo<AppLockContextValue>(
    () => ({
      isHydrated,
      isEnabled: record !== null || status === "storage-error",
      hasPasscode: record !== null && isConfiguredAppLockRecord(record),
      legacyPasscodeRequired:
        record?.state === "legacy-passcode-required",
      biometricEnabled: record?.biometricEnabled ?? false,
      lockout,
      status,
      createPasscode,
      changePasscode,
      removePasscode,
      setBiometricEnabled,
      verifyPasscode,
    }),
    [
      isHydrated,
      record,
      status,
      lockout,
      createPasscode,
      changePasscode,
      removePasscode,
      setBiometricEnabled,
      verifyPasscode,
    ],
  );

  return (
    <AppLockContext.Provider value={value}>{children}</AppLockContext.Provider>
  );
}

export function useAppLock(): AppLockContextValue {
  const context = useContext(AppLockContext);

  if (!context) {
    throw new Error("useAppLock must be used inside AppLockProvider");
  }

  return context;
}
