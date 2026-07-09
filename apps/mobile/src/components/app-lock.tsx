import * as LocalAuthentication from "expo-local-authentication";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { AppState, StyleSheet, View } from "react-native";

import {
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
import { useAppLock } from "@/security";
import { spacing, useTheme } from "@/theme";

import { AppText, Button, TextField } from "./ui";

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
    return `That passcode is incorrect. ${input.remainingAttempts} attempt${
      input.remainingAttempts === 1 ? "" : "s"
    } remaining before a temporary lockout.`;
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

export function AppLockGate({ children }: { children: ReactNode }) {
  const {
    isEnabled,
    hasPasscode,
    legacyPasscodeRequired,
    biometricEnabled,
    status,
    createPasscode,
    verifyPasscode,
  } = useAppLock();
  const { colors } = useTheme();
  const lifecycleRef = useRef<AppLockLifecycleState>(
    createAppLockLifecycleState(false),
  );
  const [lifecycle, setLifecycle] = useState<AppLockLifecycleState>(
    lifecycleRef.current,
  );
  const [authenticating, setAuthenticating] = useState(false);
  const [biometricsAvailable, setBiometricsAvailable] = useState<boolean | null>(
    null,
  );
  const [passcode, setPasscode] = useState("");
  const [passcodeError, setPasscodeError] = useState<string | null>(null);
  const [checkingPasscode, setCheckingPasscode] = useState(false);
  const [legacyAuthenticated, setLegacyAuthenticated] = useState(false);
  const [newPasscode, setNewPasscode] = useState("");
  const [confirmPasscode, setConfirmPasscode] = useState("");
  const [setupError, setSetupError] = useState<string | null>(null);
  const [savingPasscode, setSavingPasscode] = useState(false);
  const nativePromptRef = useRef(false);
  const retryBiometricsRef = useRef<() => void>(() => undefined);
  const previousEnabledRef = useRef<boolean | null>(null);

  const applyLifecycle = useCallback((next: AppLockLifecycleState) => {
    lifecycleRef.current = next;
    setLifecycle(next);
    return next;
  }, []);

  const canUseBiometrics =
    (hasPasscode && biometricEnabled) || legacyPasscodeRequired;

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
        // A configured finhance passcode is the explicit fallback. The legacy
        // migration keeps the former device-credential behaviour until the
        // user has successfully created an app-specific passcode.
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

      // If the app genuinely backgrounded while the native sheet was visible,
      // its result is deliberately stale. Resume the one pending lock request
      // after the old sheet has finished; inactive -> active churn from the
      // sheet itself never sets authenticationRequired and therefore cannot
      // create a prompt loop.
      const pending = lifecycleRef.current;
      if (
        pending.appState === "active" &&
        pending.authenticationRequired &&
        canUseBiometrics
      ) {
        retryBiometricsRef.current();
      }
    }
  }, [applyLifecycle, canUseBiometrics, legacyPasscodeRequired]);

  useEffect(() => {
    retryBiometricsRef.current = () => void unlockWithBiometrics();
  }, [unlockWithBiometrics]);

  useEffect(() => {
    const wasEnabled = previousEnabledRef.current;
    let next =
      setAppLockLifecycleEnabled(lifecycleRef.current, isEnabled);

    // Creating a passcode is itself an explicit local authentication event.
    // Keep that foreground session open; a passcode loaded from storage at app
    // launch still begins locked, and every later background transition locks.
    if (
      wasEnabled === false &&
      isEnabled &&
      status !== "storage-error"
    ) {
      next = markAppLockLifecycleAuthenticated(next);
    }

    previousEnabledRef.current = isEnabled;
    next = applyLifecycle(
      next,
    );

    if (!isEnabled) {
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
    isEnabled,
    legacyPasscodeRequired,
    status,
    unlockWithBiometrics,
  ]);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextAppState) => {
      const next = applyLifecycle(
        updateAppLockLifecycleAppState(
          lifecycleRef.current,
          toLifecycleAppState(nextAppState),
        ),
      );

      if (next.appState === "background") {
        setLegacyAuthenticated(false);
        return;
      }

      if (next.appState === "active" && next.authenticationRequired) {
        void unlockWithBiometrics();
      }
    });

    return () => subscription.remove();
  }, [applyLifecycle, unlockWithBiometrics]);

  const unlockWithPasscode = async () => {
    const armed = requestAppLockAuthentication(lifecycleRef.current);
    const { state, attempt } = beginAppLockAuthentication(armed);
    applyLifecycle(state);

    if (!attempt) {
      return;
    }

    setCheckingPasscode(true);
    setPasscodeError(null);

    try {
      const result = await verifyPasscode(passcode);
      applyLifecycle(
        completeAppLockAuthentication(lifecycleRef.current, attempt, result.success),
      );

      if (result.success) {
        setPasscode("");
        return;
      }

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

  const gateVisible =
    status === "storage-error" ||
    (isEnabled && (lifecycle.locked || legacyPasscodeRequired));

  return (
    <View style={{ flex: 1 }}>
      {children}
      {gateVisible ? (
        <View
          style={[
            StyleSheet.absoluteFill,
            styles.overlay,
            { backgroundColor: colors.bgApp },
          ]}
        >
          {status === "storage-error" ? (
            <View style={styles.content}>
              <AppText variant="title2">finhance is locked</AppText>
              <AppText variant="footnote" tone="secondary" style={styles.copy}>
                Secure storage could not be read safely. Restart finhance to try
                again. Your workspace remains hidden until the lock can be
                verified.
              </AppText>
            </View>
          ) : legacyPasscodeRequired ? (
            legacyAuthenticated ? (
              <View style={styles.content}>
                <AppText variant="title2">Create an app passcode</AppText>
                <AppText variant="footnote" tone="secondary" style={styles.copy}>
                  Your previous biometric lock is still protected. Create a 6 to
                  12 digit passcode so this device also stays protected when
                  biometrics are unavailable.
                </AppText>
                <TextField
                  label="New passcode"
                  value={newPasscode}
                  onChangeText={(value) => {
                    setNewPasscode(value.replace(/\D/g, ""));
                    setSetupError(null);
                  }}
                  secureTextEntry
                  keyboardType="number-pad"
                  inputMode="numeric"
                  maxLength={12}
                />
                <TextField
                  label="Confirm passcode"
                  value={confirmPasscode}
                  onChangeText={(value) => {
                    setConfirmPasscode(value.replace(/\D/g, ""));
                    setSetupError(null);
                  }}
                  secureTextEntry
                  keyboardType="number-pad"
                  inputMode="numeric"
                  maxLength={12}
                  error={setupError}
                />
                <Button
                  label="Save passcode"
                  onPress={() => void completeLegacySetup()}
                  loading={savingPasscode}
                />
              </View>
            ) : (
              <View style={styles.content}>
                <AppText variant="title2">finhance is locked</AppText>
                <AppText variant="footnote" tone="secondary" style={styles.copy}>
                  Unlock with your existing device credential, then create an
                  app-specific passcode.
                </AppText>
                <Button
                  label="Unlock"
                  onPress={() => void unlockWithBiometrics()}
                  loading={authenticating}
                />
                {biometricsAvailable === false ? (
                  <AppText variant="footnote" tone="danger" style={styles.copy}>
                    Device authentication is unavailable. Restore it in your
                    phone settings before continuing.
                  </AppText>
                ) : null}
              </View>
            )
          ) : (
            <View style={styles.content}>
              <AppText variant="title2">finhance is locked</AppText>
              <AppText variant="footnote" tone="secondary" style={styles.copy}>
                Enter your app passcode to view this workspace.
              </AppText>
              <TextField
                label="Passcode"
                value={passcode}
                onChangeText={(value) => {
                  setPasscode(value.replace(/\D/g, ""));
                  setPasscodeError(null);
                }}
                secureTextEntry
                keyboardType="number-pad"
                inputMode="numeric"
                maxLength={12}
                error={passcodeError}
              />
              <Button
                label="Unlock"
                onPress={() => void unlockWithPasscode()}
                loading={checkingPasscode}
                disabled={authenticating}
              />
              {biometricEnabled ? (
                <Button
                  label="Use biometrics"
                  variant="secondary"
                  onPress={() => void unlockWithBiometrics()}
                  loading={authenticating}
                  disabled={checkingPasscode}
                />
              ) : null}
              {biometricEnabled && biometricsAvailable === false ? (
                <AppText variant="footnote" tone="secondary" style={styles.copy}>
                  Biometrics are unavailable on this device. Your app passcode
                  remains available.
                </AppText>
              ) : null}
            </View>
          )}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xl,
    zIndex: 1000,
  },
  content: {
    alignItems: "stretch",
    gap: spacing.md,
    maxWidth: 420,
    width: "100%",
  },
  copy: {
    textAlign: "center",
  },
});
