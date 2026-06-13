import { Ionicons } from "@expo/vector-icons";
import { useRouter, type Href } from "expo-router";
import { View } from "react-native";

import { useRecurringPending, useSetupStatus } from "@/api/queries";
import { AppText, Card, Chip, ListRow, Screen } from "@/components/ui";
import { useTheme } from "@/theme";

type MoreHref = Href | "/expense-validation" | "/import" | "/privacy";

interface MoreEntry {
  href: MoreHref;
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle: string;
  badge?: string;
}

export default function MoreScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const setupQuery = useSetupStatus();
  const pendingQuery = useRecurringPending();

  const setupIncomplete =
    setupQuery.data !== undefined && !setupQuery.data.isComplete;
  const hasPendingRecurring = pendingQuery.data?.hasPending === true;

  const workspaceEntries: MoreEntry[] = [
    {
      href: "/accounts",
      icon: "wallet-outline",
      title: "Wallets",
      subtitle: "Accounts, balances, reconciliation",
    },
    {
      href: "/brokerage",
      icon: "trending-up-outline",
      title: "Brokerage",
      subtitle: "Positions, operations, allocation",
    },
    {
      href: "/review",
      icon: "checkmark-done-outline",
      title: "Monthly review",
      subtitle: "Close the month with confidence",
    },
    {
      href: "/recurring",
      icon: "repeat-outline",
      title: "Recurring",
      subtitle: "Rules, exceptions, materialisation",
      badge: hasPendingRecurring ? "pending" : undefined,
    },
    {
      href: "/categories",
      icon: "pricetags-outline",
      title: "Categories",
      subtitle: "Expense & income taxonomy",
    },
    {
      href: "/expense-validation",
      icon: "checkmark-circle-outline",
      title: "Expense validation",
      subtitle: "Exact-match category rules",
    },
    {
      href: "/import",
      icon: "cloud-upload-outline",
      title: "Import & export",
      subtitle: "CSV batches and web import flow",
    },
    {
      href: "/history",
      icon: "time-outline",
      title: "History",
      subtitle: "Net worth snapshots",
    },
  ];

  const systemEntries: MoreEntry[] = [
    {
      href: "/settings/setup",
      icon: "rocket-outline",
      title: "Setup checklist",
      subtitle: "Get the workspace production-ready",
      badge: setupIncomplete ? "to do" : undefined,
    },
    {
      href: "/settings",
      icon: "settings-outline",
      title: "Settings",
      subtitle: "Currency, appearance, server",
    },
    {
      href: "/privacy",
      icon: "shield-checkmark-outline",
      title: "Privacy notice",
      subtitle: "Workspace and mobile data use",
    },
  ];

  const renderEntries = (entries: MoreEntry[]) => (
    <Card style={{ paddingVertical: 4 }}>
      {entries.map((entry, index) => (
        <ListRow
          key={entry.title}
          showDivider={index < entries.length - 1}
          onPress={() => router.push(entry.href as Href)}
          left={
            <View
              style={{
                width: 38,
                height: 38,
                borderRadius: 19,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: colors.bgControl,
                borderWidth: 1,
                borderColor: colors.border,
              }}
            >
              <Ionicons
                name={entry.icon}
                size={17}
                color={colors.textSecondary}
              />
            </View>
          }
          title={entry.title}
          subtitle={entry.subtitle}
          right={
            <View
              style={{ flexDirection: "row", alignItems: "center", gap: 6 }}
            >
              {entry.badge ? <Chip label={entry.badge} tone="warning" /> : null}
              <Ionicons
                name="chevron-forward"
                size={16}
                color={colors.textTertiary}
              />
            </View>
          }
        />
      ))}
    </Card>
  );

  return (
    <Screen kicker="Everything else" title="More" withTabBarClearance>
      <View style={{ gap: 8 }}>
        <AppText variant="kicker" tone="tertiary">
          Workspace
        </AppText>
        {renderEntries(workspaceEntries)}
      </View>
      <View style={{ gap: 8 }}>
        <AppText variant="kicker" tone="tertiary">
          System
        </AppText>
        {renderEntries(systemEntries)}
      </View>
    </Screen>
  );
}
