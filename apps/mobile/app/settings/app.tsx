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
  Card,
  describeError,
  ErrorState,
  Screen,
  Section,
  SegmentedControl,
  SelectField,
  SkeletonCard,
  SwitchField,
} from "@/components/ui";
import {
  CLOCK_FORMAT_VALUES,
  LAUNCH_TAB_VALUES,
  type ClockFormat,
  type LaunchTab,
} from "@/lib/preferences";
import { useAppPreferences } from "@/prefs";
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
  system: "System",
  "12h": "12-hour",
  "24h": "24-hour",
};

const LAUNCH_TAB_LABELS: Record<LaunchTab, string> = {
  home: "Home",
  activity: "Activity",
  wallets: "Wallets",
  analytics: "Analytics",
};

export default function AppSettingsScreen() {
  const { preference, setPreference, hideMoney, setHideMoney } = useTheme();
  const {
    clockFormat,
    setClockFormat,
    useDeviceFormats,
    setUseDeviceFormats,
    launchTab,
    setLaunchTab,
    appLockEnabled,
    setAppLockEnabled,
  } = useAppPreferences();
  const settingsQuery = useUserSettings();
  const updateSettings = useUpdateUserSettings();
  const [error, setError] = useState<string | null>(null);
  const [appLockError, setAppLockError] = useState<string | null>(null);

  const settings = settingsQuery.data;

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

  const updateAppLock = async (enabled: boolean) => {
    setAppLockError(null);

    if (!enabled) {
      setAppLockEnabled(false);
      return;
    }

    try {
      const [hasHardware, isEnrolled] = await Promise.all([
        LocalAuthentication.hasHardwareAsync(),
        LocalAuthentication.isEnrolledAsync(),
      ]);

      if (!hasHardware || !isEnrolled) {
        setAppLockError(
          "Set up Face ID, Touch ID or a device passcode before enabling app lock.",
        );
        return;
      }

      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: "Enable app lock",
        fallbackLabel: "Use passcode",
        disableDeviceFallback: false,
      });

      if (!result.success) {
        setAppLockError("App lock was not enabled.");
        return;
      }

      setAppLockEnabled(true);
    } catch {
      setAppLockError("Unable to enable app lock on this device.");
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

      <Section kicker="Security" title="App lock">
        <Card>
          <View style={{ gap: spacing.md }}>
            <SwitchField
              label="Require Face ID or Touch ID"
              description="Locks the app after launch or when it returns from the background."
              value={appLockEnabled}
              onChange={(value) => void updateAppLock(value)}
            />
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
              <AppText variant="footnoteMedium">Clock</AppText>
              <SegmentedControl
                options={CLOCK_FORMAT_VALUES.map((value) => ({
                  value,
                  label: CLOCK_FORMAT_LABELS[value],
                }))}
                value={clockFormat}
                onChange={(value) => setClockFormat(value as ClockFormat)}
              />
            </View>
            <SwitchField
              label="Use device region formats"
              description="Matches this phone's date, time and number formatting."
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
    </Screen>
  );
}
