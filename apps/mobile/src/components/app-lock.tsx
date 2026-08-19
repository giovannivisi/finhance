import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { type ReactNode } from "react";
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  isValidPasscode,
  PASSCODE_MAX_LENGTH,
  PASSCODE_MIN_LENGTH,
} from "@/security/app-lock";
import { fonts, radius, spacing, useTheme } from "@/theme";

import { AppText, Button, ScreenGlow, TextField } from "./ui";
import { useAppLockGateController } from "./use-app-lock-gate";

const KEYPAD_ROWS = [
  ["1", "2", "3"],
  ["4", "5", "6"],
  ["7", "8", "9"],
] as const;
const LAUNCH_LOGO_SIZE = 160;

function BrandLogo({ size }: { size: number }) {
  const { scheme } = useTheme();
  const source =
    scheme === "light"
      ? require("../../assets/icon.png")
      : require("../../assets/icon-dark.png");

  return (
    <Image
      accessibilityLabel="finhance logo"
      resizeMode="contain"
      source={source}
      style={{
        borderRadius: Math.round(size * 0.27),
        height: size,
        width: size,
      }}
    />
  );
}

function LaunchCover() {
  const { colors, scheme } = useTheme();
  const source =
    scheme === "light"
      ? require("../../assets/splash-icon-light.png")
      : require("../../assets/splash-icon.png");

  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
      style={[
        StyleSheet.absoluteFill,
        styles.launchCover,
        { backgroundColor: colors.bgApp },
      ]}
    >
      <View style={styles.launchLogo}>
        <Image
          accessibilityLabel="finhance logo"
          resizeMode="contain"
          source={source}
          style={styles.launchLogoImage}
        />
      </View>
    </View>
  );
}

interface PasscodeGateProps {
  authenticating: boolean;
  biometricsAvailable: boolean | null;
  biometricEnabled: boolean;
  checkingPasscode: boolean;
  error: string | null;
  onBiometricUnlock: () => void;
  onChangePasscode: (value: string) => void;
  onSubmit: () => void;
  passcode: string;
}

function PasscodeGate({
  authenticating,
  biometricsAvailable,
  biometricEnabled,
  checkingPasscode,
  error,
  onBiometricUnlock,
  onChangePasscode,
  onSubmit,
  passcode,
}: PasscodeGateProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const compact = height < 760;
  const busy = authenticating || checkingPasscode;
  const canSubmit = isValidPasscode(passcode) && !busy;
  const biometricName = Platform.OS === "ios" ? "Face ID" : "biometrics";

  const addDigit = (digit: string) => {
    if (busy || passcode.length >= PASSCODE_MAX_LENGTH) {
      return;
    }

    Haptics.selectionAsync().catch(() => undefined);
    onChangePasscode(`${passcode}${digit}`);
  };

  const removeDigit = () => {
    if (busy || passcode.length === 0) {
      return;
    }

    Haptics.selectionAsync().catch(() => undefined);
    onChangePasscode(passcode.slice(0, -1));
  };

  const renderDigit = (digit: string) => (
    <Pressable
      key={digit}
      accessibilityLabel={digit}
      accessibilityRole="button"
      disabled={busy}
      onPress={() => addDigit(digit)}
      style={({ pressed }) => [
        styles.key,
        compact ? styles.keyCompact : null,
        pressed && !busy ? { backgroundColor: colors.bgCardHover } : null,
        busy ? styles.keyDisabled : null,
      ]}
    >
      <AppText style={styles.keyLabel} tabular>
        {digit}
      </AppText>
    </Pressable>
  );

  return (
    <View
      accessibilityViewIsModal
      style={[
        StyleSheet.absoluteFill,
        styles.overlay,
        { backgroundColor: colors.bgApp },
      ]}
    >
      <ScreenGlow />
      <View
        style={[
          styles.lockScreen,
          {
            paddingTop: compact
              ? Math.max(insets.top + spacing.lg, 52)
              : Math.max(insets.top + 80, 168),
            paddingBottom: Math.max(insets.bottom, spacing.lg),
          },
        ]}
      >
        <View style={[styles.intro, compact ? styles.introCompact : null]}>
          <View style={[styles.logo, compact ? styles.logoCompact : null]}>
            <BrandLogo size={compact ? 76 : 92} />
          </View>
          <View style={styles.heading}>
            <AppText
              variant="display"
              style={[styles.title, compact ? styles.titleCompact : null]}
            >
              Welcome back
            </AppText>
            <AppText variant="body" tone="secondary" style={styles.subtitle}>
              Enter your passcode or use {biometricName} to open your workspace.
            </AppText>
          </View>
        </View>

        <View style={styles.passcodeSection}>
          <View style={styles.passcodeRow}>
            <View
              accessible
              accessibilityLabel={`${passcode.length} passcode digits entered`}
              style={styles.dots}
            >
              {Array.from({ length: PASSCODE_MAX_LENGTH }, (_, index) => (
                <View
                  key={index}
                  style={[
                    styles.dot,
                    {
                      backgroundColor:
                        index < passcode.length
                          ? colors.textPrimary
                          : "transparent",
                      borderColor:
                        index < passcode.length
                          ? colors.textPrimary
                          : colors.borderStrong,
                    },
                  ]}
                />
              ))}
            </View>
            <Pressable
              accessibilityLabel="Unlock"
              accessibilityRole="button"
              accessibilityState={{ disabled: !canSubmit, busy }}
              disabled={!canSubmit}
              onPress={onSubmit}
              style={({ pressed }) => [
                styles.submit,
                {
                  backgroundColor: canSubmit
                    ? colors.primary
                    : colors.bgControl,
                  borderColor: canSubmit
                    ? colors.primary
                    : colors.borderControl,
                },
                pressed ? styles.submitPressed : null,
              ]}
            >
              <Ionicons
                name="arrow-forward"
                size={22}
                color={canSubmit ? "#ffffff" : colors.textTertiary}
              />
            </Pressable>
          </View>

          <View style={styles.feedback}>
            {checkingPasscode ? (
              <View style={styles.feedbackRow}>
                <ActivityIndicator size="small" color={colors.primary} />
                <AppText variant="footnote" tone="secondary">
                  Checking…
                </AppText>
              </View>
            ) : error ? (
              <AppText
                accessibilityLiveRegion="polite"
                variant="footnote"
                tone="danger"
                style={styles.feedbackText}
              >
                {error}
              </AppText>
            ) : (
              <AppText variant="caption" tone="tertiary">
                {PASSCODE_MIN_LENGTH}–{PASSCODE_MAX_LENGTH} digits
              </AppText>
            )}
          </View>
        </View>

        <View style={[styles.keypad, compact ? styles.keypadCompact : null]}>
          {KEYPAD_ROWS.map((row) => (
            <View key={row[0]} style={styles.keypadRow}>
              {row.map(renderDigit)}
            </View>
          ))}
          <View style={styles.keypadRow}>
            {biometricEnabled && biometricsAvailable !== false ? (
              <Pressable
                accessibilityLabel={
                  Platform.OS === "ios" ? "Use Face ID" : "Use biometrics"
                }
                accessibilityRole="button"
                disabled={busy}
                onPress={onBiometricUnlock}
                style={({ pressed }) => [
                  styles.key,
                  compact ? styles.keyCompact : null,
                  pressed && !busy
                    ? { backgroundColor: colors.bgCardHover }
                    : null,
                  busy ? styles.keyDisabled : null,
                ]}
              >
                {authenticating ? (
                  <ActivityIndicator size="small" color={colors.primary} />
                ) : (
                  <Ionicons
                    name="scan-outline"
                    size={32}
                    color={colors.primary}
                  />
                )}
              </Pressable>
            ) : (
              <View style={[styles.key, compact ? styles.keyCompact : null]} />
            )}
            {renderDigit("0")}
            <Pressable
              accessibilityLabel="Delete digit"
              accessibilityRole="button"
              disabled={busy || passcode.length === 0}
              onPress={removeDigit}
              onLongPress={() => onChangePasscode("")}
              style={({ pressed }) => [
                styles.key,
                compact ? styles.keyCompact : null,
                pressed && !busy
                  ? { backgroundColor: colors.bgCardHover }
                  : null,
                busy || passcode.length === 0 ? styles.keyDisabled : null,
              ]}
            >
              <Ionicons
                name="backspace-outline"
                size={34}
                color={colors.textPrimary}
              />
            </Pressable>
          </View>
        </View>

        <View style={styles.trustRow}>
          <Ionicons
            name="shield-checkmark-outline"
            size={20}
            color={colors.primary}
          />
          <AppText variant="footnote" tone="secondary">
            Protected on this device
          </AppText>
        </View>
      </View>
    </View>
  );
}

function GateForm({ children }: { children: ReactNode }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <View
      accessibilityViewIsModal
      style={[
        StyleSheet.absoluteFill,
        styles.overlay,
        { backgroundColor: colors.bgApp },
      ]}
    >
      <ScreenGlow />
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1 }}
      >
        <View
          style={[
            styles.formContent,
            {
              paddingTop: insets.top + spacing.xxl,
              paddingBottom: Math.max(insets.bottom, spacing.xl),
            },
          ]}
        >
          {children}
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

export interface AppLockGateProps {
  active?: boolean;
  children: ReactNode;
  onReady?: () => void;
}

export function AppLockGate({
  active = true,
  children,
  onReady,
}: AppLockGateProps) {
  const {
    accessibility,
    authenticating,
    biometricEnabled,
    biometricsAvailable,
    checkingPasscode,
    completeLegacySetup,
    confirmPasscode,
    gateVisible,
    launchCoverVisible,
    legacyAuthenticated,
    legacyPasscodeRequired,
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
    status,
    unlockWithBiometrics,
    unlockWithPasscode,
  } = useAppLockGateController({ active, onReady });
  const { colors } = useTheme();
  return (
    <View style={styles.root}>
      <View
        accessibilityElementsHidden={accessibility.accessibilityElementsHidden}
        importantForAccessibility={accessibility.importantForAccessibility}
        style={styles.workspace}
      >
        {children}
      </View>
      {gateVisible ? (
        status === "storage-error" ? (
          <GateForm>
            <View style={styles.formHeading}>
              <Ionicons
                name="lock-closed-outline"
                size={30}
                color={colors.textPrimary}
              />
              <AppText variant="title1" style={styles.formTitle}>
                finhance is locked
              </AppText>
              <AppText variant="body" tone="secondary" style={styles.formCopy}>
                Secure storage could not be read safely. Restart finhance to try
                again. Your workspace remains hidden until the lock can be
                verified.
              </AppText>
            </View>
          </GateForm>
        ) : legacyPasscodeRequired ? (
          legacyAuthenticated ? (
            <GateForm>
              <View style={styles.formHeading}>
                <AppText variant="title1" style={styles.formTitle}>
                  Create an app passcode
                </AppText>
                <AppText
                  variant="body"
                  tone="secondary"
                  style={styles.formCopy}
                >
                  Create a 6 to 12 digit passcode so this device stays protected
                  when biometrics are unavailable.
                </AppText>
              </View>
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
                maxLength={PASSCODE_MAX_LENGTH}
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
                maxLength={PASSCODE_MAX_LENGTH}
                error={setupError}
              />
              <Button
                label="Save passcode"
                onPress={() => void completeLegacySetup()}
                loading={savingPasscode}
              />
            </GateForm>
          ) : (
            <GateForm>
              <View style={styles.formHeading}>
                <AppText variant="title1" style={styles.formTitle}>
                  Welcome back
                </AppText>
                <AppText
                  variant="body"
                  tone="secondary"
                  style={styles.formCopy}
                >
                  Unlock with your existing device credential, then create an
                  app-specific passcode.
                </AppText>
              </View>
              <Button
                label="Unlock"
                onPress={() => void unlockWithBiometrics()}
                loading={authenticating}
              />
              {biometricsAvailable === false ? (
                <AppText
                  variant="footnote"
                  tone="danger"
                  style={styles.formCopy}
                >
                  Device authentication is unavailable. Restore it in your phone
                  settings before continuing.
                </AppText>
              ) : null}
            </GateForm>
          )
        ) : (
          <PasscodeGate
            authenticating={authenticating}
            biometricsAvailable={biometricsAvailable}
            biometricEnabled={biometricEnabled}
            checkingPasscode={checkingPasscode}
            error={passcodeError}
            onBiometricUnlock={() => void unlockWithBiometrics()}
            onChangePasscode={(value) => {
              setPasscode(value);
              setPasscodeError(null);
            }}
            onSubmit={() => void unlockWithPasscode()}
            passcode={passcode}
          />
        )
      ) : null}
      {launchCoverVisible ? <LaunchCover /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  workspace: {
    flex: 1,
  },
  overlay: {
    zIndex: 1000,
  },
  launchCover: {
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1100,
  },
  launchLogo: {
    width: LAUNCH_LOGO_SIZE,
    height: LAUNCH_LOGO_SIZE,
    zIndex: 1,
  },
  launchLogoImage: {
    width: LAUNCH_LOGO_SIZE,
    height: LAUNCH_LOGO_SIZE,
  },
  lockScreen: {
    flex: 1,
    justifyContent: "space-between",
    paddingHorizontal: spacing.xxl,
  },
  intro: {
    alignItems: "center",
    gap: spacing.xl,
  },
  introCompact: {
    gap: spacing.md,
  },
  logo: {
    width: 92,
    height: 92,
    borderRadius: 25,
    zIndex: 1,
  },
  logoCompact: {
    width: 76,
    height: 76,
    borderRadius: 21,
  },
  heading: {
    alignItems: "center",
    gap: spacing.sm,
  },
  title: {
    fontSize: 32,
    lineHeight: 38,
    letterSpacing: -0.9,
    textAlign: "center",
  },
  titleCompact: {
    fontSize: 28,
    lineHeight: 34,
  },
  subtitle: {
    maxWidth: 300,
    textAlign: "center",
  },
  passcodeSection: {
    alignItems: "center",
    gap: spacing.sm,
  },
  passcodeRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.md,
    justifyContent: "center",
    minHeight: 48,
  },
  dots: {
    alignItems: "center",
    flexDirection: "row",
    gap: 6,
  },
  dot: {
    borderRadius: 5,
    borderWidth: 1.5,
    height: 9,
    width: 9,
  },
  submit: {
    alignItems: "center",
    borderRadius: 22,
    borderWidth: 1,
    height: 44,
    justifyContent: "center",
    width: 44,
  },
  submitPressed: {
    opacity: 0.75,
    transform: [{ scale: 0.96 }],
  },
  feedback: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: 24,
  },
  feedbackRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.sm,
  },
  feedbackText: {
    textAlign: "center",
  },
  keypad: {
    gap: spacing.sm,
  },
  keypadCompact: {
    gap: spacing.xs,
  },
  keypadRow: {
    flexDirection: "row",
    justifyContent: "space-around",
  },
  key: {
    alignItems: "center",
    borderRadius: radius.control,
    height: 58,
    justifyContent: "center",
    width: 72,
  },
  keyCompact: {
    height: 50,
  },
  keyDisabled: {
    opacity: 0.45,
  },
  keyLabel: {
    fontFamily: fonts.regular,
    fontSize: 31,
    lineHeight: 38,
  },
  trustRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.sm,
    justifyContent: "center",
    minHeight: 24,
  },
  formContent: {
    alignSelf: "center",
    flex: 1,
    gap: spacing.lg,
    justifyContent: "center",
    maxWidth: 420,
    paddingHorizontal: spacing.xl,
    width: "100%",
  },
  formHeading: {
    alignItems: "center",
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  formTitle: {
    textAlign: "center",
  },
  formCopy: {
    textAlign: "center",
  },
});
