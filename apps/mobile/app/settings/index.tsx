import { useRouter } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import {
  SUPPORTED_REPORTING_CURRENCY_CODES,
  USER_START_PAGE_VALUES,
  type UserStartPage,
} from "@finhance/shared";

import { useServerConnection } from "@/api/server-connection";
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
} from "@/components/ui";
import { useTheme, type ThemePreference } from "@/theme";
import { spacing } from "@/theme";

const START_PAGE_LABELS: Record<UserStartPage, string> = {
  DASHBOARD: "Dashboard",
  ACTIVITY: "Activity",
  WALLETS: "Wallets",
  BROKERAGE: "Brokerage",
  BUDGETS: "Budgets",
  MONTHLY_CLOSE: "Monthly close",
  ANALYTICS: "Analytics",
};

export default function SettingsScreen() {
  const router = useRouter();
  const { preference, setPreference, hideMoney, setHideMoney } = useTheme();
  const { serverUrl, serverMode, token, clearServer } = useServerConnection();
  const settingsQuery = useUserSettings();
  const updateSettings = useUpdateUserSettings();
  const [error, setError] = useState<string | null>(null);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const [confirmMobileSignOut, setConfirmMobileSignOut] = useState(false);
  const [isSigningOutMobileDevices, setIsSigningOutMobileDevices] =
    useState(false);

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

  const signOutMobileDevices = async () => {
    if (!serverUrl || serverMode !== "hosted" || !token) {
      return;
    }

    setError(null);
    setIsSigningOutMobileDevices(true);

    try {
      const response = await fetch(`${serverUrl}/api/mobile/sessions`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        let message = "Unable to sign out mobile devices.";

        try {
          const payload = (await response.json()) as { message?: unknown };
          if (typeof payload.message === "string" && payload.message.trim()) {
            message = payload.message;
          }
        } catch {
          // Keep the generic message when the server does not return JSON.
        }

        throw new Error(message);
      }

      setConfirmMobileSignOut(false);
      await clearServer();
      router.replace("/login");
    } catch (signOutError) {
      setConfirmMobileSignOut(false);
      setError(describeError(signOutError));
    } finally {
      setIsSigningOutMobileDevices(false);
    }
  };

  return (
    <Screen kicker="Preferences" title="Settings" showBack withTabBarClearance>
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
        kicker="Workspace"
        title="Server preferences"
        description="Saved on your finhance server."
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
                hint="Where the web app opens; the mobile app always starts at Home."
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

      <Section kicker="Connection" title="Server">
        <Card>
          <View style={{ gap: spacing.md }}>
            <View style={{ gap: 2 }}>
              <AppText variant="caption" tone="tertiary">
                CONNECTED TO
              </AppText>
              <AppText variant="bodyMedium" numberOfLines={1}>
                {serverUrl || "—"}
              </AppText>
              <AppText variant="caption" tone="tertiary">
                {serverMode === "hosted"
                  ? "Hosted · signed in with your finhance account"
                  : "Self-hosted · local auth mode"}
              </AppText>
            </View>
            <Button
              label={serverMode === "hosted" ? "Sign out" : "Disconnect"}
              variant="danger"
              size="sm"
              onPress={() => setConfirmDisconnect(true)}
            />
          </View>
        </Card>
      </Section>

      {serverMode === "hosted" ? (
        <Section kicker="Security" title="Mobile devices">
          <Card surface="warning">
            <View style={{ gap: spacing.md }}>
              <AppText variant="footnote" tone="secondary">
                Sign out every mobile device connected to this hosted account.
                This device will need to sign in again too.
              </AppText>
              <Button
                label="Sign out mobile devices"
                variant="danger"
                size="sm"
                onPress={() => setConfirmMobileSignOut(true)}
              />
            </View>
          </Card>
        </Section>
      ) : null}

      <Sheet
        visible={confirmDisconnect}
        onClose={() => setConfirmDisconnect(false)}
        title="Disconnect server?"
      >
        <View style={{ gap: spacing.lg, paddingBottom: spacing.lg }}>
          <AppText variant="footnote" tone="secondary">
            The app forgets this server and returns to the connect screen. No
            data on the server is touched.
          </AppText>
          <Button
            label="Disconnect"
            variant="danger"
            onPress={async () => {
              setConfirmDisconnect(false);
              await clearServer();
              router.replace("/login");
            }}
          />
          <Button
            label="Stay connected"
            variant="secondary"
            onPress={() => setConfirmDisconnect(false)}
          />
        </View>
      </Sheet>

      <Sheet
        visible={confirmMobileSignOut}
        onClose={() => setConfirmMobileSignOut(false)}
        title="Sign out mobile devices?"
      >
        <View style={{ gap: spacing.lg, paddingBottom: spacing.lg }}>
          <AppText variant="footnote" tone="secondary">
            Every signed-in mobile device loses access immediately. You will
            return to the connect screen after this completes.
          </AppText>
          <Button
            label="Sign out devices"
            variant="danger"
            loading={isSigningOutMobileDevices}
            onPress={signOutMobileDevices}
          />
          <Button
            label="Cancel"
            variant="secondary"
            onPress={() => setConfirmMobileSignOut(false)}
          />
        </View>
      </Sheet>
    </Screen>
  );
}
