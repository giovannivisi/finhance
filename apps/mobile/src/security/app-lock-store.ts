import {
  createLegacyPasscodeRequiredRecord,
  parseAppLockRecord,
  type AppLockRecord,
} from "./app-lock";

export const APP_LOCK_SECURE_STORE_KEY = "finhance.appLock.v1";
export const LEGACY_APP_LOCK_ASYNC_STORAGE_KEY = "finhance.appLock";
export const BIOMETRIC_OPT_IN_ASYNC_STORAGE_KEY =
  "finhance.appLock.biometricOptIn.v1";

export interface AsyncKeyValueStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

export type AppLockLoadResult =
  | { state: "empty" }
  | { state: "record"; record: AppLockRecord }
  | { state: "invalid-record" };

export interface AppLockStore {
  load(): Promise<AppLockLoadResult>;
  save(record: AppLockRecord): Promise<void>;
  remove(): Promise<void>;
  /** Retire the legacy boolean after a passcode has been configured or removed. */
  clearLegacyFlag(): Promise<void>;
  /** Biometrics are explicit consent for this installation, not the keychain. */
  setBiometricOptIn(enabled: boolean): Promise<void>;
}

export function createAppLockStore(
  secureStorage: AsyncKeyValueStorage,
  legacyStorage: AsyncKeyValueStorage,
  now: () => number = Date.now,
): AppLockStore {
  return {
    async load(): Promise<AppLockLoadResult> {
      const rawRecord = await secureStorage.getItem(APP_LOCK_SECURE_STORE_KEY);

      if (rawRecord !== null) {
        const record = parseStoredRecord(rawRecord);

        if (!record) {
          return { state: "invalid-record" };
        }

        if (record.state === "configured" && record.biometricEnabled) {
          const optedIn =
            (await legacyStorage.getItem(
              BIOMETRIC_OPT_IN_ASYNC_STORAGE_KEY,
            )) === "true";

          if (!optedIn) {
            // iOS Keychain records can survive an uninstall while AsyncStorage
            // does not. Reset biometric consent on a fresh installation so
            // the OS permission sheet can only follow an explicit Settings
            // action in this installation.
            const passcodeOnlyRecord = {
              ...record,
              biometricEnabled: false,
              updatedAt: now(),
            };
            await secureStorage.setItem(
              APP_LOCK_SECURE_STORE_KEY,
              JSON.stringify(passcodeOnlyRecord),
            );
            return { state: "record", record: passcodeOnlyRecord };
          }
        }

        return { state: "record", record };
      }

      const legacyAppLock = await legacyStorage.getItem(
        LEGACY_APP_LOCK_ASYNC_STORAGE_KEY,
      );

      if (legacyAppLock !== "true") {
        return { state: "empty" };
      }

      // Do not clear the old flag yet. The current app stays protected by the
      // legacy setting until a passcode record has been written successfully.
      const record = createLegacyPasscodeRequiredRecord(now());
      await secureStorage.setItem(
        APP_LOCK_SECURE_STORE_KEY,
        JSON.stringify(record),
      );
      return { state: "record", record };
    },

    async save(record: AppLockRecord): Promise<void> {
      await secureStorage.setItem(
        APP_LOCK_SECURE_STORE_KEY,
        JSON.stringify(record),
      );
    },

    async remove(): Promise<void> {
      await secureStorage.removeItem(APP_LOCK_SECURE_STORE_KEY);
    },

    async clearLegacyFlag(): Promise<void> {
      await legacyStorage.removeItem(LEGACY_APP_LOCK_ASYNC_STORAGE_KEY);
    },

    async setBiometricOptIn(enabled: boolean): Promise<void> {
      if (enabled) {
        await legacyStorage.setItem(BIOMETRIC_OPT_IN_ASYNC_STORAGE_KEY, "true");
        return;
      }

      await legacyStorage.removeItem(BIOMETRIC_OPT_IN_ASYNC_STORAGE_KEY);
    },
  };
}

function parseStoredRecord(rawRecord: string): AppLockRecord | null {
  try {
    return parseAppLockRecord(JSON.parse(rawRecord));
  } catch {
    return null;
  }
}
