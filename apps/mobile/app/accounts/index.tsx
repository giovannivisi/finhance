import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { View } from "react-native";
import type {
  AccountReconciliationResponse,
  AccountResponse,
  AccountType,
} from "@finhance/shared";

import { useAccountsPage } from "@/api/queries";
import {
  AppText,
  Card,
  Chip,
  EmptyState,
  ErrorState,
  IconButton,
  ListRow,
  MoneyText,
  Screen,
  Section,
  SkeletonCard,
  SwitchField,
} from "@/components/ui";
import { ACCOUNT_TYPE_LABELS } from "@/lib/labels";
import { spacing, useTheme } from "@/theme";

const TYPE_ORDER: AccountType[] = [
  "BANK",
  "BROKER",
  "CARD",
  "CASH",
  "LOAN",
  "OTHER",
];

const TYPE_ICONS: Record<AccountType, keyof typeof Ionicons.glyphMap> = {
  BANK: "business-outline",
  BROKER: "trending-up-outline",
  CARD: "card-outline",
  CASH: "cash-outline",
  LOAN: "home-outline",
  OTHER: "wallet-outline",
};

function ReconciliationBadge({
  reconciliation,
}: {
  reconciliation: AccountReconciliationResponse | undefined;
}) {
  if (!reconciliation || reconciliation.status === "UNSUPPORTED") {
    return null;
  }

  if (reconciliation.status === "CLEAN") {
    return <Chip label="Reconciled" tone="success" />;
  }

  return <Chip label="Mismatch" tone="warning" />;
}

function AccountRow({
  account,
  reconciliation,
  showDivider,
  onPress,
}: {
  account: AccountResponse;
  reconciliation: AccountReconciliationResponse | undefined;
  showDivider: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  const trackedBalance = reconciliation?.trackedBalance ?? null;

  return (
    <ListRow
      onPress={onPress}
      showDivider={showDivider}
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
            name={TYPE_ICONS[account.type]}
            size={17}
            color={colors.textSecondary}
          />
        </View>
      }
      title={account.name}
      subtitle={[account.institution, account.currency]
        .filter(Boolean)
        .join(" • ")}
      right={
        <View style={{ alignItems: "flex-end", gap: 3 }}>
          {trackedBalance !== null ? (
            <MoneyText
              amount={trackedBalance}
              currency={reconciliation?.currency ?? account.currency}
              variant="bodyMedium"
            />
          ) : null}
          <ReconciliationBadge reconciliation={reconciliation} />
        </View>
      }
    />
  );
}

export function WalletsScreenContent({
  showBack = true,
}: {
  showBack?: boolean;
}) {
  const router = useRouter();
  const { colors } = useTheme();
  const [includeArchived, setIncludeArchived] = useState(false);
  const pageQuery = useAccountsPage(includeArchived);

  const data = pageQuery.data;

  const reconciliationByAccount = useMemo(
    () =>
      new Map(
        (data?.reconciliations ?? []).map((entry) => [entry.accountId, entry]),
      ),
    [data?.reconciliations],
  );

  const groups = useMemo(() => {
    const active = (data?.accounts ?? []).filter(
      (account) => !account.archivedAt,
    );
    return TYPE_ORDER.map((type) => ({
      type,
      label: ACCOUNT_TYPE_LABELS[type],
      items: active
        .filter((account) => account.type === type)
        .sort((left, right) => left.order - right.order),
    })).filter((group) => group.items.length > 0);
  }, [data?.accounts]);

  const archivedAccounts = useMemo(
    () => (data?.accounts ?? []).filter((account) => account.archivedAt),
    [data?.accounts],
  );

  const mismatchCount = (data?.reconciliations ?? []).filter(
    (entry) => entry.status === "MISMATCH",
  ).length;

  return (
    <Screen
      kicker="Wallets"
      title="Accounts"
      showBack={showBack}
      withTabBarClearance
      refreshing={pageQuery.isRefetching}
      onRefresh={() => pageQuery.refetch()}
      headerRight={
        <IconButton
          accessibilityLabel="Add account"
          icon={<Ionicons name="add" size={20} color={colors.textPrimary} />}
          onPress={() => router.push("/accounts/upsert")}
        />
      }
    >
      {pageQuery.isPending ? (
        <>
          <SkeletonCard lines={3} />
          <SkeletonCard lines={3} />
        </>
      ) : pageQuery.isError || !data ? (
        <ErrorState
          error={pageQuery.error}
          onRetry={() => pageQuery.refetch()}
        />
      ) : (
        <>
          {mismatchCount > 0 ? (
            <Card surface="warning">
              <AppText variant="footnote" tone="warning">
                {mismatchCount === 1
                  ? "1 account does not reconcile."
                  : `${mismatchCount} accounts do not reconcile.`}{" "}
                Open an account to see what drifted.
              </AppText>
            </Card>
          ) : null}

          {groups.length === 0 ? (
            <EmptyState
              icon="wallet-outline"
              title="No accounts yet"
              description="Accounts are containers for your money — banks, cards, cash, brokers, and loans."
              actionLabel="Add your first account"
              onAction={() => router.push("/accounts/upsert")}
            />
          ) : (
            groups.map((group) => (
              <Section key={group.type} title={group.label}>
                <Card style={{ paddingVertical: 4 }}>
                  {group.items.map((account, index) => (
                    <AccountRow
                      key={account.id}
                      account={account}
                      reconciliation={reconciliationByAccount.get(account.id)}
                      showDivider={index < group.items.length - 1}
                      onPress={() =>
                        router.push({
                          pathname: "/accounts/[id]",
                          params: { id: account.id },
                        })
                      }
                    />
                  ))}
                </Card>
              </Section>
            ))
          )}

          <Card surface="muted">
            <SwitchField
              label="Show archived accounts"
              value={includeArchived}
              onChange={setIncludeArchived}
            />
            {includeArchived && archivedAccounts.length > 0 ? (
              <View style={{ marginTop: spacing.sm }}>
                {archivedAccounts.map((account, index) => (
                  <AccountRow
                    key={account.id}
                    account={account}
                    reconciliation={reconciliationByAccount.get(account.id)}
                    showDivider={index < archivedAccounts.length - 1}
                    onPress={() =>
                      router.push({
                        pathname: "/accounts/[id]",
                        params: { id: account.id },
                      })
                    }
                  />
                ))}
              </View>
            ) : includeArchived ? (
              <AppText
                variant="footnote"
                tone="tertiary"
                style={{ marginTop: spacing.sm }}
              >
                Nothing archived.
              </AppText>
            ) : null}
          </Card>
        </>
      )}
    </Screen>
  );
}

export default function WalletsScreen() {
  return <WalletsScreenContent />;
}
