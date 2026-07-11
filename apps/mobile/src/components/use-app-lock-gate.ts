import * as Haptics from "expo-haptics";
import * as LocalAuthentication from "expo-local-authentication";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";

import { useAppLock } from "@/security";
import { isValidPasscode } from "@/security/app-lock";
import {
  APP_LOCK_BACKGROUND_GRACE_MS,
  beginAppLockAuthentication,
  completeAppLockAuthentication,
  createAppLockLifecycleState,
  markAppLockLifecycleAuthenticated,
  requestAppLockAuthentication,
  setAppLockLifecycleEnabled,
  updateAppLockLifecycleAppState,
  type AppLockLifecycleAppState,
  type AppLockLifecycleState,
} from "@/security/app-lock-lifecycle";

import { resolveAppLockGateVisibility } from "./app-lock-gate";

function toLifecycleAppState(value: string): AppLockLifecycleAppState {
  if (
    value === "active" ||
    value === "background" ||
    value === "inactive" ||
    value === "extension"
  ) {
    return value;
  }

  return "unknown";
}

function yieldToNextFrame(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => resolve());
  });
}

async function hasAvailableLocalAuthentication(
  allowDeviceCredential: boolean,
): Promise<boolean> {
  try {
    const [hasHardware, isEnrolled] = await Promise.all([
      LocalAuthentication.hasHardwareAsync(),
      LocalAuthentication.isEnrolledAsync(),
    ]);
    return hasHardware && (isEnrolled || allowDeviceCredential);
  } catch {
    return false;
  }
}

function describePasscodeFailure(input: {
  lockedUntil: number | null;
  remainingAttempts: number;
  reason: string;
}): string {
  if (input.lockedUntil) {
    const seconds = Math.max(
      1,
      Math.ceil((input.lockedUntil - Date.now()) / 1000),
    );
    return `Too many attempts. Try again in ${seconds} second${
      seconds === 1 ? "" : "s"
    }.`;
  }

  if (input.reason === "invalid-passcode") {
    return "Enter a 6 to 12 digit passcode.";
  }

  if (input.remainingAttempts > 0) {
    return `Incorrect passcode. ${input.remainingAttempts} attempt${
      input.remainingAttempts === 1 ? "" : "s"
    } remaining.`;
  }

  return "That passcode is incorrect.";
}

function describeSetupFailure(reason: string): string {
  if (reason === "invalid-passcode") {
    return "Use a passcode containing 6 to 12 digits.";
  }

  if (reason === "storage-error") {
    return "Secure storage is unavailable. Restart finhance and try again.";
  }

  return "Unable to save your app passcode. Try again.";
}

export function useAppLockGateController({
  active,
  onReady,
}: {
  active: boolean;
  onReady?: () => void;
}) {
  const appLock = useAppLock();
  const {
    isEnabled,
    hasPasscode,
    legacyPasscodeRequired,
    biometricEnabled,
    status,
    createPasscode,
    verifyPasscode,
  } = appLock;
  const lifecycleRef = useRef<AppLockLifecycleState>(
    createAppLockLifecycleState(false),
  );
  const [lifecycle, setLifecycle] = useState(lifecycleRef.current);
  const [authenticating, setAuthenticating] = useState(false);
  const [biometricsAvailable, setBiometricsAvailable] = useState<
    boolean | null
  >(null);
  const [passcode, setPasscode] = useState("");
  const [passcodeError, setPasscodeError] = useState<string | null>(null);
  const [checkingPasscode, setCheckingPasscode] = useState(false);
  const [legacyAuthenticated, setLegacyAuthenticated] = useState(false);
  const [newPasscode, setNewPasscode] = useState("");
  const [confirmPasscode, setConfirmPasscode] = useState("");
  const [setupError, setSetupError] = useState<string | null>(null);
  const [savingPasscode, setSavingPasscode] = useState(false);
  const [launchCoverVisible, setLaunchCoverVisible] = useState(true);
  const nativePromptRef = useRef(false);
  const nativeSplashReadyRef = useRef(false);
  const retryBiometricsRef = useRef<() => void>(() => undefined);
  const previousEnabledRef = useRef<boolean | null>(null);

  const applyLifecycle = useCallback((next: AppLockLifecycleState) => {
    lifecycleRef.current = next;
    setLifecycle(next);
    return next;
  }, []);

  const lockActive = active && isEnabled;
  const canUseBiometrics =
    lockActive && ((hasPasscode && biometricEnabled) || legacyPasscodeRequired);

  const unlockWithBiometrics = useCallback(async () => {
    if (!canUseBiometrics || nativePromptRef.current) {
      return;
    }

    const armed = requestAppLockAuthentication(lifecycleRef.current);
    const { state, attempt } = beginAppLockAuthentication(armed);
    applyLifecycle(state);

    if (!attempt) {
      return;
    }

    nativePromptRef.current = true;
    setAuthenticating(true);

    try {
      const available = await hasAvailableLocalAuthentication(
        legacyPasscodeRequired,
      );
      setBiometricsAvailable(available);

      if (!available) {
        applyLifecycle(
          completeAppLockAuthentication(lifecycleRef.current, attempt, false),
        );
        return;
      }

      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: "Unlock finhance",
        fallbackLabel: legacyPasscodeRequired
          ? "Use device passcode"
          : "Use finhance passcode",
        disableDeviceFallback: !legacyPasscodeRequired,
      });
      const completed = applyLifecycle(
        completeAppLockAuthentication(
          lifecycleRef.current,
          attempt,
          result.success,
        ),
      );

      if (result.success && !completed.locked && legacyPasscodeRequired) {
        setLegacyAuthenticated(true);
      }
    } catch {
      applyLifecycle(
        completeAppLockAuthentication(lifecycleRef.current, attempt, false),
      );
    } finally {
      nativePromptRef.current = false;
      setAuthenticating(false);

      const pending = lifecycleRef.current;
      const shouldRetry =
        pending.appState === "active" &&
        pending.authenticationRequired &&
        canUseBiometrics;

      if (shouldRetry) {
        retryBiometricsRef.current();
      } else {
        setLaunchCoverVisible(false);
      }
    }
  }, [applyLifecycle, canUseBiometrics, legacyPasscodeRequired]);

  useEffect(() => {
    retryBiometricsRef.current = () => void unlockWithBiometrics();
  }, [unlockWithBiometrics]);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      if (!nativeSplashReadyRef.current) {
        nativeSplashReadyRef.current = true;
        onReady?.();
      }

      if (status === "storage-error" || !lockActive || !canUseBiometrics) {
        setLaunchCoverVisible(false);
      }
    });

    return () => cancelAnimationFrame(frame);
  }, [canUseBiometrics, lockActive, onReady, status]);

  useEffect(() => {
    const wasEnabled = previousEnabledRef.current;
    let next = setAppLockLifecycleEnabled(lifecycleRef.current, lockActive);

    if (wasEnabled === false && lockActive && status !== "storage-error") {
      next = markAppLockLifecycleAuthenticated(next);
    }

    previousEnabledRef.current = lockActive;
    next = applyLifecycle(next);

    if (!lockActive) {
      setLegacyAuthenticated(false);
      setPasscode("");
      setPasscodeError(null);
      return;
    }

    if (legacyPasscodeRequired) {
      setLegacyAuthenticated(false);
    }

    if (next.authenticationRequired && canUseBiometrics) {
      void unlockWithBiometrics();
    }
  }, [
    applyLifecycle,
    canUseBiometrics,
    legacyPasscodeRequired,
    lockActive,
    status,
    unlockWithBiometrics,
  ]);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextAppState) => {
      const appState = toLifecycleAppState(nextAppState);

      if (lockActive && appState !== "active") {
        setLaunchCoverVisible(true);
      }

      const next = applyLifecycle(
        updateAppLockLifecycleAppState(
          lifecycleRef.current,
          appState,
          Date.now(),
          APP_LOCK_BACKGROUND_GRACE_MS,
        ),
      );

      if (next.appState === "background") {
        setLegacyAuthenticated(false);
        return;
      }

      if (
        next.appState === "active" &&
        next.authenticationRequired &&
        canUseBiometrics
      ) {
        void unlockWithBiometrics();
        return;
      }

      if (next.appState === "active") {
        setLaunchCoverVisible(false);
      }
    });

    return () => subscription.remove();
  }, [applyLifecycle, canUseBiometrics, lockActive, unlockWithBiometrics]);

  const unlockWithPasscode = async () => {
    if (!isValidPasscode(passcode) || checkingPasscode) {
      return;
    }

    const armed = requestAppLockAuthentication(lifecycleRef.current);
    const { state, attempt } = beginAppLockAuthentication(armed);
    applyLifecycle(state);

    if (!attempt) {
      return;
    }

    setCheckingPasscode(true);
    setPasscodeError(null);
    await yieldToNextFrame();

    try {
      const result = await verifyPasscode(passcode);
      applyLifecycle(
        completeAppLockAuthentication(
          lifecycleRef.current,
          attempt,
          result.success,
        ),
      );

      if (result.success) {
        Haptics.notificationAsync(
          Haptics.NotificationFeedbackType.Success,
        ).catch(() => undefined);
        setPasscode("");
        return;
      }

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(
        () => undefined,
      );
      setPasscode("");
      setPasscodeError(describePasscodeFailure(result));
    } finally {
      setCheckingPasscode(false);
    }
  };

  const completeLegacySetup = async () => {
    setSetupError(null);

    if (newPasscode !== confirmPasscode) {
      setSetupError("The passcodes do not match.");
      return;
    }

    setSavingPasscode(true);
    await yieldToNextFrame();

    try {
      const result = await createPasscode(newPasscode);

      if (!result.success) {
        setSetupError(describeSetupFailure(result.reason));
        return;
      }

      setNewPasscode("");
      setConfirmPasscode("");
      setLegacyAuthenticated(false);
    } finally {
      setSavingPasscode(false);
    }
  };

  const visibility = resolveAppLockGateVisibility({
    active,
    isEnabled,
    legacyPasscodeRequired,
    lifecycleLocked: lifecycle.locked,
    launchCoverVisible,
    status,
  });

  return {
    ...appLock,
    ...visibility,
    authenticating,
    biometricsAvailable,
    checkingPasscode,
    completeLegacySetup,
    confirmPasscode,
    launchCoverVisible,
    legacyAuthenticated,
    newPasscode,
    passcode,
    passcodeError,
    savingPasscode,
    setConfirmPasscode,
    setNewPasscode,
    setPasscode,
    setPasscodeError,
    setSetupError,
    setupError,
    unlockWithBiometrics,
    unlockWithPasscode,
  };
}
