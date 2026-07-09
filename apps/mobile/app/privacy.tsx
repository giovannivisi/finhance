import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import * as WebBrowser from "expo-web-browser";
import { View } from "react-native";

import { useServerConnection } from "@/api/server-connection";
import {
  AppText,
  Button,
  Card,
  Chip,
  ErrorState,
  ListRow,
  Screen,
  Section,
  SkeletonCard,
} from "@/components/ui";
import { useFormatters } from "@/prefs";
import { spacing, useTheme } from "@/theme";

interface PrivacyContact {
  name: string;
  email: string | null;
  website: string | null;
  postalAddress: string | null;
  instructions: string | null;
}

interface PrivacyCategoryGroup {
  title: string;
  items: string[];
}

interface PrivacyProcessingActivity {
  key: string;
  title: string;
  purpose: string;
  dataCategories: string[];
  legalBasis: {
    basis: string;
    explanation: string;
    legitimateInterests: string | null;
  };
}

interface PrivacyRetentionEntry {
  key: string;
  title: string;
  retention: string;
  detail: string;
}

interface MobilePrivacyNotice {
  deploymentMode: "local" | "managed" | "mixed";
  lastUpdated: string;
  controller: PrivacyContact;
  rightsContact: PrivacyContact;
  supervisoryAuthority: {
    name: string;
    complaintUrl: string;
  };
  categoryGroups: PrivacyCategoryGroup[];
  sourceOfData: string[];
  processingActivities: PrivacyProcessingActivity[];
  retention: PrivacyRetentionEntry[];
  automatedDecisionMaking: string;
}

async function fetchHostedPrivacyNotice(
  serverUrl: string,
): Promise<MobilePrivacyNotice> {
  const response = await fetch(`${serverUrl}/api/mobile/privacy`, {
    headers: { Accept: "application/json" },
  });

  if (!response.ok) {
    throw new Error("The hosted privacy notice is unavailable.");
  }

  return (await response.json()) as MobilePrivacyNotice;
}

function contactSubtitle(contact: PrivacyContact): string {
  return (
    contact.email ??
    contact.website ??
    contact.postalAddress ??
    contact.instructions ??
    "Contact details are set by the workspace operator."
  );
}

export default function PrivacyScreen() {
  const { colors } = useTheme();
  const format = useFormatters();
  const { serverMode, serverUrl } = useServerConnection();
  const canOpenHostedNotice = serverMode === "hosted" && Boolean(serverUrl);
  const privacyQuery = useQuery({
    queryKey: ["mobile-privacy", serverUrl] as const,
    queryFn: () => fetchHostedPrivacyNotice(serverUrl ?? ""),
    enabled: canOpenHostedNotice,
    staleTime: 5 * 60_000,
  });
  const notice = privacyQuery.data ?? null;

  const openFullNotice = () => {
    if (!canOpenHostedNotice || !serverUrl) {
      return;
    }

    void WebBrowser.openBrowserAsync(`${serverUrl}/privacy`);
  };

  return (
    <Screen kicker="Privacy" title="Notice" showBack withTabBarClearance>
      <Card surface="muted">
        <View style={{ gap: spacing.md }}>
          <View style={{ gap: 4 }}>
            <AppText variant="footnoteMedium">
              {notice?.controller.name ?? "Connected workspace"}
            </AppText>
            <AppText variant="footnote" tone="secondary">
              {notice
                ? `Last updated ${format.date(notice.lastUpdated)}.`
                : serverMode === "hosted"
                  ? "Loading the hosted notice for this workspace."
                  : "The local workspace operator controls the full privacy notice."}
            </AppText>
          </View>
          <View style={{ flexDirection: "row", gap: spacing.sm }}>
            <Chip
              label={serverMode === "hosted" ? "hosted" : "local"}
              tone={serverMode === "hosted" ? "accent" : "neutral"}
            />
            {notice ? (
              <Chip label={notice.deploymentMode} tone="neutral" />
            ) : null}
          </View>
          {canOpenHostedNotice ? (
            <Button
              label="Open full web notice"
              variant="secondary"
              size="sm"
              onPress={openFullNotice}
              icon={
                <Ionicons
                  name="open-outline"
                  size={16}
                  color={colors.textPrimary}
                />
              }
            />
          ) : null}
        </View>
      </Card>

      <Section kicker="Mobile app" title="On this device">
        <Card>
          <View style={{ gap: spacing.md }}>
            <ListRow
              title="Server connection"
              subtitle="The server URL and mode are stored on this device."
              showDivider
            />
            <ListRow
              title="Hosted session"
              subtitle="Hosted sign-in stores the mobile token in the device keychain."
              showDivider
            />
            <ListRow
              title="Display preferences"
              subtitle="Theme and hide-amounts preferences are local to this device."
              showDivider
            />
            <ListRow
              title="Finance records"
              subtitle="Data screens cache records in memory while the app is open."
            />
          </View>
        </Card>
      </Section>

      {canOpenHostedNotice && privacyQuery.isPending ? (
        <>
          <SkeletonCard lines={3} />
          <SkeletonCard lines={3} />
        </>
      ) : privacyQuery.isError ? (
        <ErrorState
          error={privacyQuery.error}
          onRetry={() => privacyQuery.refetch()}
        />
      ) : notice ? (
        <>
          <Section kicker="Contacts" title="Controller and rights">
            <Card style={{ paddingVertical: 4 }}>
              <ListRow
                title={notice.controller.name}
                subtitle={contactSubtitle(notice.controller)}
                showDivider
              />
              <ListRow
                title={notice.rightsContact.name}
                subtitle={contactSubtitle(notice.rightsContact)}
                showDivider
              />
              <ListRow
                title={notice.supervisoryAuthority.name}
                subtitle={notice.supervisoryAuthority.complaintUrl}
              />
            </Card>
          </Section>

          <Section kicker="Data" title="What the workspace processes">
            <View style={{ gap: spacing.md }}>
              {notice.categoryGroups.map((group) => (
                <Card key={group.title}>
                  <View style={{ gap: spacing.sm }}>
                    <AppText variant="footnoteMedium">{group.title}</AppText>
                    {group.items.map((item) => (
                      <View
                        key={item}
                        style={{
                          flexDirection: "row",
                          gap: spacing.sm,
                          alignItems: "flex-start",
                        }}
                      >
                        <View
                          style={{
                            width: 5,
                            height: 5,
                            borderRadius: 3,
                            marginTop: 7,
                            backgroundColor: colors.textTertiary,
                          }}
                        />
                        <AppText
                          variant="caption"
                          tone="secondary"
                          style={{ flex: 1 }}
                        >
                          {item}
                        </AppText>
                      </View>
                    ))}
                  </View>
                </Card>
              ))}
            </View>
          </Section>

          <Section kicker="Purpose" title="Processing activities">
            <View style={{ gap: spacing.md }}>
              {notice.processingActivities.map((activity) => (
                <Card key={activity.key}>
                  <View style={{ gap: spacing.sm }}>
                    <AppText variant="footnoteMedium">
                      {activity.title}
                    </AppText>
                    <AppText variant="caption" tone="secondary">
                      {activity.purpose}
                    </AppText>
                    <AppText variant="caption" tone="tertiary">
                      {activity.legalBasis.basis}
                    </AppText>
                  </View>
                </Card>
              ))}
            </View>
          </Section>

          <Section kicker="Retention" title="How long data is kept">
            <Card style={{ paddingVertical: 4 }}>
              {notice.retention.map((entry, index) => (
                <ListRow
                  key={entry.key}
                  title={entry.title}
                  subtitle={entry.retention}
                  titleLines={2}
                  showDivider={index < notice.retention.length - 1}
                />
              ))}
            </Card>
          </Section>

          <Card surface="info">
            <AppText variant="footnote" tone="secondary">
              {notice.automatedDecisionMaking}
            </AppText>
          </Card>
        </>
      ) : (
        <Card surface="info">
          <View style={{ gap: spacing.sm }}>
            <AppText variant="footnoteMedium">Local workspace notice</AppText>
            <AppText variant="footnote" tone="secondary">
              This app is connected directly to an API server. Open the web app
              that belongs to the same deployment and read `/privacy` for the
              operator-specific notice, contact details, processors, transfers,
              and retention settings.
            </AppText>
          </View>
        </Card>
      )}
    </Screen>
  );
}
