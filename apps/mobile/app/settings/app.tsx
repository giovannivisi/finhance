import * as LocalAuthentication from "expo-local-authentication";
import { useState } from "react";
import { View } from "react-native";
import {
  SUPPORTED_REPORTING_CURRENCY_CODES,
  USER_START_PAGE_VALUES,
  type UserStartPage,
} from "@finhance/shared";

import { useUpdateUserSettings, useUserSettings } from "@/api/queries";
import {
  AppText,
  Button,
  Card,
  describeError,
  ErrorState,
  Screen,
  Section,
  SegmentedControl,
  SelectField,
  Sheet,
  SkeletonCard,
  SwitchField,
  TextField,
} from "@/components/ui";
import {
  CLOCK_FORMAT_VALUES,
  LAUNCH_TAB_VALUES,
  type ClockFormat,
  type LaunchTab,
} from "@/lib/preferences";
import { useAppPreferences } from "@/prefs";
import { useAppLock } from "@/security";
import { spacing, useTheme, type ThemePreference } from "@/theme";

const START_PAGE_LABELS: Record<UserStartPage, string> = {
  DASHBOARD: "Dashboard",
  ACTIVITY: "Activity",
  WALLETS: "Wallets",
  BROKERAGE: "Brokerage",
  BUDGETS: "Budgets",
  MONTHLY_CLOSE: "Monthly close",
  ANALYTICS: "Analytics",
};

const CLOCK_FORMAT_LABELS: Record<ClockFormat, string> = {
  system: "Default",
  "12h": "12-hour",
  "24h": "24-hour",
};

const LAUNCH_TAB_LABELS: Record<LaunchTab, string> = {
  home: "Home",
  activity: "Activity",
  wallets: "Wallets",
  analytics: "Analytics",
};

type PasscodeSheetMode = "create" | "change" | "remove" | null;

function yieldToNextFrame(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => resolve());
  });
}

function describeAppLockFailure(reason: string): string {
  switch (reason) {
    case "invalid-passcode":
      return "Use a passcode containing 6 to 12 digits.";
    case "incorrect":
      return "Your current app passcode is incorrect.";
    case "locked":
      return "Too many attempts. Wait for the temporary lockout to end and try again.";
    case "legacy-passcode-required":
      return "Unlock the app and create a passcode before changing this setting.";
    case "storage-error":
      return "Secure storage is unavailable. Restart finhance and try again.";
    default:
      return "Unable to update app lock. Try again.";
  }
}

function titleForPasscodeSheet(mode: Exclude<PasscodeSheetMode, null>): string {
  if (mode === "create") {
    return "Create app passcode";
  }

  return mode === "change" ? "Change app passcode" : "Remove app lock";
}

export default function AppSettingsScreen() {
  const { preference, setPreference, hideMoney, setHideMoney } = useTheme();
  const {
    clockFormat,
    setClockFormat,
    useDeviceFormats,
    setUseDeviceFormats,
    launchTab,
    setLaunchTab,
  } = useAppPreferences();
  const {
    hasPasscode,
    legacyPasscodeRequired,
    biometricEnabled,
    status: appLockStatus,
    createPasscode,
    changePasscode,
    removePasscode,
    setBiometricEnabled,
  } = useAppLock();
  const settingsQuery = useUserSettings();
  const updateSettings = useUpdateUserSettings();
  const [error, setError] = useState<string | null>(null);
  const [appLockError, setAppLockError] = useState<string | null>(null);
  const [passcodeSheetMode, setPasscodeSheetMode] =
    useState<PasscodeSheetMode>(null);
  const [currentPasscode, setCurrentPasscode] = useState("");
  const [newPasscode, setNewPasscode] = useState("");
  const [confirmPasscode, setConfirmPasscode] = useState("");
  const [passcodeSubmitting, setPasscodeSubmitting] = useState(false);
  const [biometricSubmitting, setBiometricSubmitting] = useState(false);

  const settings = settingsQuery.data;
  const securityBusy = passcodeSubmitting || biometricSubmitting;

  const applySettings = async (
    patch: Parameters<typeof updateSettings.mutateAsync>[0],
  ) => {
    setError(null);
    try {
      await updateSettings.mutateAsync(patch);
    } catch (updateError) {
      setError(describeError(updateError));
    }
  };

  const resetPasscodeSheet = () => {
    setPasscodeSheetMode(null);
    setCurrentPasscode("");
    setNewPasscode("");
    setConfirmPasscode("");
    setAppLockError(null);
  };

  const openPasscodeSheet = (mode: Exclude<PasscodeSheetMode, null>) => {
    setCurrentPasscode("");
    setNewPasscode("");
    setConfirmPasscode("");
    setAppLockError(null);
    setPasscodeSheetMode(mode);
  };

  const submitPasscodeSheet = async () => {
    const mode = passcodeSheetMode;

    if (!mode) {
      return;
    }

    setAppLockError(null);

    if (
      (mode === "create" || mode === "change") &&
      newPasscode !== confirmPasscode
    ) {
      setAppLockError("The new passcodes do not match.");
      return;
    }

    setPasscodeSubmitting(true);
    await yieldToNextFrame();

    try {
      const result =
        mode === "create"
          ? await createPasscode(newPasscode)
          : mode === "change"
            ? await changePasscode(currentPasscode, newPasscode)
            : await removePasscode(currentPasscode);

      if (!result.success) {
        setAppLockError(describeAppLockFailure(result.reason));
        return;
      }

      resetPasscodeSheet();
    } finally {
      setPasscodeSubmitting(false);
    }
  };

  const updateBiometricUnlock = async (enabled: boolean) => {
    if (biometricSubmitting) {
      return;
    }

    setAppLockError(null);
    setBiometricSubmitting(true);

    try {
      if (enabled) {
        const [hasHardware, isEnrolled] = await Promise.all([
          LocalAuthentication.hasHardwareAsync(),
          LocalAuthentication.isEnrolledAsync(),
        ]);

        if (!hasHardware || !isEnrolled) {
          setAppLockError(
            "Set up Face ID, Touch ID or another biometric before enabling biometric unlock.",
          );
          return;
        }

        const result = await LocalAuthentication.authenticateAsync({
          promptMessage: "Enable biometric unlock",
          fallbackLabel: "Use finhance passcode",
          disableDeviceFallback: true,
        });

        if (!result.success) {
          setAppLockError("Biometric unlock was not enabled.");
          return;
        }
      }

      const result = await setBiometricEnabled(enabled);

      if (!result.success) {
        setAppLockError(describeAppLockFailure(result.reason));
      }
    } catch {
      setAppLockError("Unable to update biometric unlock on this device.");
    } finally {
      setBiometricSubmitting(false);
    }
  };

  return (
    <Screen kicker="Device" title="App settings" showBack withTabBarClearance>
      <Section
        kicker="Appearance"
        title="On this device"
        description="Stored locally, never sent to the server."
      >
        <Card>
          <View style={{ gap: spacing.lg }}>
            <View style={{ gap: spacing.sm }}>
              <AppText variant="footnoteMedium">Theme</AppText>
              <SegmentedControl
                options={[
                  { value: "system", label: "System" },
                  { value: "dark", label: "Dark" },
                  { value: "light", label: "Light" },
                ]}
                value={preference}
                onChange={(value) => setPreference(value as ThemePreference)}
              />
            </View>
            <SwitchField
              label="Hide amounts"
              description="Masks money everywhere until toggled back."
              value={hideMoney}
              onChange={setHideMoney}
            />
          </View>
        </Card>
      </Section>

      <Section
        kicker="Security"
        title="App lock"
        description="Your app passcode stays on this device and is never sent to finhance."
      >
        <Card
          surface={appLockStatus === "storage-error" ? "danger" : "default"}
        >
          <View style={{ gap: spacing.md }}>
            {appLockStatus === "storage-error" ? (
              <AppText variant="footnote" tone="danger">
                Secure storage is unavailable, so app lock settings cannot be
                changed safely. Restart finhance and try again.
              </AppText>
            ) : legacyPasscodeRequired ? (
              <AppText variant="footnote" tone="secondary">
                Your existing device lock is being migrated. Unlock the app and
                create a 6 to 12 digit app passcode to finish securing this
                device.
              </AppText>
            ) : hasPasscode ? (
              <>
                <AppText variant="footnote" tone="secondary">
                  A 6 to 12 digit passcode protects this workspace after launch
                  and whenever the app returns from the background.
                </AppText>
                <SwitchField
                  label="Use Face ID or Touch ID"
                  description="Uses biometrics for faster unlock. Your app passcode remains available if biometrics are unavailable."
                  value={biometricEnabled}
                  onChange={(value) => void updateBiometricUnlock(value)}
                />
                <View style={{ gap: spacing.sm }}>
                  <Button
                    label="Change app passcode"
                    variant="secondary"
                    size="sm"
                    disabled={securityBusy}
                    onPress={() => openPasscodeSheet("change")}
                  />
                  <Button
                    label="Remove app lock"
                    variant="danger"
                    size="sm"
                    disabled={securityBusy}
                    onPress={() => openPasscodeSheet("remove")}
                  />
                </View>
              </>
            ) : (
              <>
                <AppText variant="footnote" tone="secondary">
                  Protect this app with a 6 to 12 digit passcode. It is stored
                  securely on this device, with biometrics available as an
                  optional faster unlock afterwards.
                </AppText>
                <Button
                  label="Create app passcode"
                  size="sm"
                  onPress={() => openPasscodeSheet("create")}
                />
              </>
            )}
            {appLockError ? (
              <AppText variant="footnote" tone="danger">
                {appLockError}
              </AppText>
            ) : null}
          </View>
        </Card>
      </Section>

      <Section
        kicker="Formats"
        title="On this device"
        description="Used for dates, times and money display in this app."
      >
        <Card>
          <View style={{ gap: spacing.lg }}>
            <View style={{ gap: spacing.sm }}>
              <AppText variant="footnoteMedium">Time style</AppText>
              <SegmentedControl
                options={CLOCK_FORMAT_VALUES.map((value) => ({
                  value,
                  label: CLOCK_FORMAT_LABELS[value],
                }))}
                value={clockFormat}
                onChange={(value) => setClockFormat(value as ClockFormat)}
              />
              <AppText variant="footnote" tone="secondary">
                Default follows the selected display region. Choosing 12-hour or
                24-hour always overrides that default.
              </AppText>
            </View>
            <SwitchField
              label="Use this device's language and region"
              description={
                "Uses this phone's date and number formatting, and its default time style. Turn it off to use finhance's English (UK) defaults."
              }
              value={useDeviceFormats}
              onChange={setUseDeviceFormats}
            />
          </View>
        </Card>
      </Section>

      <Section kicker="Launch" title="Open at launch">
        <Card>
          <SelectField
            label="Open at launch"
            options={LAUNCH_TAB_VALUES.map((value) => ({
              value,
              label: LAUNCH_TAB_LABELS[value],
            }))}
            value={launchTab}
            onChange={(value) => setLaunchTab(value as LaunchTab)}
            hint="Used once per cold app start."
          />
        </Card>
      </Section>

      <Section
        kicker="Display"
        title="Synced to your server"
        description="Shared by your finhance account across clients."
      >
        {settingsQuery.isPending ? (
          <SkeletonCard lines={3} />
        ) : settingsQuery.isError || !settings ? (
          <ErrorState
            error={settingsQuery.error}
            onRetry={() => settingsQuery.refetch()}
          />
        ) : (
          <Card>
            <View style={{ gap: spacing.lg }}>
              <SelectField
                label="Reporting currency"
                options={SUPPORTED_REPORTING_CURRENCY_CODES.map((code) => ({
                  value: code,
                  label: code,
                }))}
                value={settings.reportingCurrency}
                onChange={(value) =>
                  applySettings({ reportingCurrency: value })
                }
                hint="Used for net worth and aggregate totals. Rows keep their native currency."
              />
              <SelectField
                label="Web start page"
                options={USER_START_PAGE_VALUES.map((value) => ({
                  value,
                  label: START_PAGE_LABELS[value],
                }))}
                value={settings.startPage}
                onChange={(value) => applySettings({ startPage: value })}
                hint="Where the web app opens."
              />
              <SwitchField
                label="Show transaction times"
                description="Display posting times next to activity rows."
                value={settings.showTransactionTimes}
                onChange={(value) =>
                  applySettings({ showTransactionTimes: value })
                }
              />
              {settings.cloudParserAvailable ? (
                <SwitchField
                  label="Enable cloud-enhanced drafts"
                  description="I explicitly agree that Finhance may send selected, redacted transaction text to Groq in the United States solely to create a draft. This may include health, religious, or trade-union information I choose to enter. I can turn this off at any time; basic parsing remains available."
                  value={settings.cloudParserEnabled}
                  onChange={(value) =>
                    applySettings({
                      cloudParserEnabled: value,
                      cloudParserConsentVersion: value
                        ? (settings.cloudParserConsentVersion ?? undefined)
                        : undefined,
                    })
                  }
                />
              ) : null}
            </View>
          </Card>
        )}
      </Section>

      {error ? (
        <Card surface="danger">
          <AppText variant="footnote" tone="danger">
            {error}
          </AppText>
        </Card>
      ) : null}

      <Sheet
        visible={passcodeSheetMode !== null}
        onClose={() => {
          if (!passcodeSubmitting) {
            resetPasscodeSheet();
          }
        }}
        title={
          passcodeSheetMode
            ? titleForPasscodeSheet(passcodeSheetMode)
            : "App passcode"
        }
      >
        <View style={{ gap: spacing.lg, paddingBottom: spacing.lg }}>
          <AppText variant="footnote" tone="secondary">
            {passcodeSheetMode === "create"
              ? "Choose a 6 to 12 digit passcode for this device."
              : passcodeSheetMode === "change"
                ? "Confirm your current passcode, then choose a new one."
                : "Confirm your current passcode to remove app lock from this device."}
          </AppText>
          {passcodeSheetMode === "change" || passcodeSheetMode === "remove" ? (
            <TextField
              label="Current passcode"
              value={currentPasscode}
              onChangeText={(value) => {
                setCurrentPasscode(value.replace(/\D/g, ""));
                setAppLockError(null);
              }}
              secureTextEntry
              keyboardType="number-pad"
              inputMode="numeric"
              maxLength={12}
            />
          ) : null}
          {passcodeSheetMode === "create" || passcodeSheetMode === "change" ? (
            <>
              <TextField
                label="New passcode"
                value={newPasscode}
                onChangeText={(value) => {
                  setNewPasscode(value.replace(/\D/g, ""));
                  setAppLockError(null);
                }}
                secureTextEntry
                keyboardType="number-pad"
                inputMode="numeric"
                maxLength={12}
              />
              <TextField
                label="Confirm new passcode"
                value={confirmPasscode}
                onChangeText={(value) => {
                  setConfirmPasscode(value.replace(/\D/g, ""));
                  setAppLockError(null);
                }}
                secureTextEntry
                keyboardType="number-pad"
                inputMode="numeric"
                maxLength={12}
                error={appLockError}
              />
            </>
          ) : appLockError ? (
            <AppText variant="footnote" tone="danger">
              {appLockError}
            </AppText>
          ) : null}
          <Button
            label={
              passcodeSheetMode === "remove"
                ? "Remove app lock"
                : passcodeSheetMode === "change"
                  ? "Save new passcode"
                  : "Create app passcode"
            }
            variant={passcodeSheetMode === "remove" ? "danger" : "primary"}
            loading={passcodeSubmitting}
            onPress={() => void submitPasscodeSheet()}
          />
          <Button
            label="Cancel"
            variant="secondary"
            disabled={passcodeSubmitting}
            onPress={resetPasscodeSheet}
          />
        </View>
      </Sheet>
    </Screen>
  );
}
