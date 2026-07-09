import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { View } from "react-native";
import type { AccountReconciliationResponse } from "@finhance/shared";

import { useApiClient } from "@/api/server-connection";
import { api } from "@/api/endpoints";
import { useQuery } from "@tanstack/react-query";
import {
  useArchiveAccount,
  useDeleteAccountPermanently,
  useEstablishOpeningBalanceBaseline,
  useReconciliationAdjustment,
  useUnarchiveAccount,
} from "@/api/queries";
import {
  AppText,
  Button,
  Card,
  Chip,
  describeError,
  Divider,
  ErrorState,
  IconButton,
  ListRow,
  MoneyText,
  Screen,
  Section,
  Sheet,
  SkeletonCard,
  Stat,
} from "@/components/ui";
import {
  signedTransactionAmount,
  transactionSubtitle,
} from "@/features/transactions/derive";
import { localDateOf } from "@/lib/dates";
import { ACCOUNT_TYPE_LABELS } from "@/lib/labels";
import { useFormatters } from "@/prefs";
import { spacing, useTheme } from "@/theme";

function ReconciliationCard({
  reconciliation,
  onAdjust,
  onBaseline,
  adjustPending,
  baselinePending,
}: {
  reconciliation: AccountReconciliationResponse;
  onAdjust: () => void;
  onBaseline: () => void;
  adjustPending: boolean;
  baselinePending: boolean;
}) {
  const isMismatch = reconciliation.status === "MISMATCH";

  if (reconciliation.status === "UNSUPPORTED") {
    return (
      <Card surface="muted">
        <AppText variant="footnote" tone="secondary">
          Reconciliation is not applicable to this account type.
        </AppText>
      </Card>
    );
  }

  return (
    <Card surface={isMismatch ? "warning" : "success"}>
      <View style={{ gap: spacing.md }}>
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <AppText variant="title3">
            {isMismatch ? "Out of balance" : "Reconciled"}
          </AppText>
          <Chip
            label={
              reconciliation.reconciliationScope === "CASH_ONLY"
                ? "Cash only"
                : "Full balance"
            }
            tone="neutral"
          />
        </View>

        <View style={{ flexDirection: "row", gap: spacing.xl }}>
          <Stat
            label="Tracked"
            value={
              reconciliation.trackedBalance !== null ? (
                <MoneyText
                  amount={reconciliation.trackedBalance}
                  currency={reconciliation.currency}
                  variant="title3"
                />
              ) : (
                "—"
              )
            }
            style={{ flex: 1 }}
          />
          <Stat
            label="From activity"
            value={
              reconciliation.expectedBalance !== null ? (
                <MoneyText
                  amount={reconciliation.expectedBalance}
                  currency={reconciliation.currency}
                  variant="title3"
                />
              ) : (
                "—"
              )
            }
            style={{ flex: 1 }}
          />
        </View>

        {isMismatch && reconciliation.delta !== null ? (
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <AppText variant="footnoteMedium" tone="secondary">
              Drift
            </AppText>
            <MoneyText
              amount={reconciliation.delta}
              currency={reconciliation.currency}
              variant="bodySemibold"
              colorBySign
              signDisplay="exceptZero"
            />
          </View>
        ) : null}

        {reconciliation.diagnostics.length > 0 ? (
          <View style={{ gap: spacing.sm }}>
            <Divider />
            {reconciliation.diagnostics.map((diagnostic) => (
              <View key={diagnostic.code} style={{ gap: 2 }}>
                <AppText variant="footnoteMedium">{diagnostic.summary}</AppText>
                <AppText variant="caption" tone="secondary">
                  {diagnostic.likelyCause}
                </AppText>
                <AppText variant="caption" tone="tertiary">
                  {diagnostic.recommendedAction}
                </AppText>
              </View>
            ))}
          </View>
        ) : null}

        {isMismatch ? (
          <View style={{ gap: spacing.sm }}>
            <AppText variant="caption" tone="secondary">
              {reconciliation.adjustmentGuidance.message}
            </AppText>
            {reconciliation.canCreateAdjustment &&
            reconciliation.adjustmentGuidance.status !== "BLOCKED" ? (
              <Button
                label="Post adjustment to close the gap"
                variant="secondary"
                size="sm"
                onPress={onAdjust}
                loading={adjustPending}
              />
            ) : null}
            {reconciliation.canEstablishOpeningBalanceBaseline ? (
              <>
                {reconciliation.openingBalanceBaselineGuidance ? (
                  <AppText variant="caption" tone="secondary">
                    {reconciliation.openingBalanceBaselineGuidance}
                  </AppText>
                ) : null}
                <Button
                  label="Set opening-balance baseline"
                  variant="secondary"
                  size="sm"
                  onPress={onBaseline}
                  loading={baselinePending}
                />
              </>
            ) : null}
          </View>
        ) : null}
      </View>
    </Card>
  );
}

export default function AccountDetailScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const format = useFormatters();
  const params = useLocalSearchParams<{ id: string }>();
  const accountId = params.id;
  const client = useApiClient();

  const accountQuery = useQuery({
    queryKey: ["accounts", "detail", accountId],
    queryFn: () => api.accounts.get(client, accountId),
  });
  const reconciliationsQuery = useQuery({
    queryKey: ["accounts", "reconciliation-all"],
    queryFn: () => api.accounts.reconciliation(client, true),
  });
  const transactionsQuery = useQuery({
    queryKey: ["transactions", "recent", accountId],
    queryFn: () =>
      api.transactions.list(client, {
        accountId,
        includeArchivedAccounts: true,
        limit: 15,
      }),
  });

  const archiveMutation = useArchiveAccount();
  const unarchiveMutation = useUnarchiveAccount();
  const deleteMutation = useDeleteAccountPermanently();
  const adjustMutation = useReconciliationAdjustment();
  const baselineMutation = useEstablishOpeningBalanceBaseline();

  const [confirmArchive, setConfirmArchive] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const account = accountQuery.data;
  const reconciliation = useMemo(
    () =>
      reconciliationsQuery.data?.find((entry) => entry.accountId === accountId),
    [reconciliationsQuery.data, accountId],
  );

  const accountNames = useMemo(
    () => new Map(account ? [[account.id, account.name]] : []),
    [account],
  );

  if (accountQuery.isPending) {
    return (
      <Screen title="Account" showBack>
        <SkeletonCard lines={4} />
      </Screen>
    );
  }

  if (accountQuery.isError || !account) {
    return (
      <Screen title="Account" showBack>
        <ErrorState
          error={accountQuery.error}
          onRetry={() => accountQuery.refetch()}
        />
      </Screen>
    );
  }

  const isArchived = Boolean(account.archivedAt);
  const isBroker = account.type === "BROKER";

  const runAction = async (
    action: () => Promise<unknown>,
    after?: () => void,
  ) => {
    setActionError(null);
    try {
      await action();
      after?.();
    } catch (error) {
      setActionError(describeError(error));
    }
  };

  return (
    <Screen
      kicker={ACCOUNT_TYPE_LABELS[account.type]}
      title={account.name}
      showBack
      refreshing={
        accountQuery.isRefetching ||
        reconciliationsQuery.isRefetching ||
        transactionsQuery.isRefetching
      }
      onRefresh={() =>
        Promise.all([
          accountQuery.refetch(),
          reconciliationsQuery.refetch(),
          transactionsQuery.refetch(),
        ])
      }
      headerRight={
        <IconButton
          accessibilityLabel="Edit account"
          icon={
            <Ionicons
              name="create-outline"
              size={18}
              color={colors.textPrimary}
            />
          }
          onPress={() =>
            router.push({
              pathname: "/accounts/upsert",
              params: { id: account.id },
            })
          }
        />
      }
    >
      {isArchived ? (
        <Card surface="muted">
          <AppText variant="footnote" tone="secondary">
            This account is archived. It keeps its history but cannot receive
            new activity.
          </AppText>
        </Card>
      ) : null}

      <Card>
        <View style={{ gap: spacing.md }}>
          <View style={{ flexDirection: "row", gap: spacing.xl }}>
            <Stat
              label="Currency"
              value={account.currency}
              style={{ flex: 1 }}
            />
            <Stat
              label="Institution"
              value={account.institution ?? "—"}
              style={{ flex: 2 }}
            />
          </View>
          {account.openingBalanceDate ? (
            <View style={{ flexDirection: "row", gap: spacing.xl }}>
              <Stat
                label="Opening balance"
                value={
                  <MoneyText
                    amount={account.openingBalance}
                    currency={account.currency}
                    variant="title3"
                  />
                }
                style={{ flex: 1 }}
              />
              <Stat
                label="As of"
                value={format.date(localDateOf(account.openingBalanceDate))}
                style={{ flex: 2 }}
              />
            </View>
          ) : null}
          {account.notes ? (
            <AppText variant="footnote" tone="secondary">
              {account.notes}
            </AppText>
          ) : null}
        </View>
      </Card>

      {isBroker ? (
        <Card
          surface="info"
          onPress={() =>
            router.push({
              pathname: "/brokerage/[accountId]",
              params: { accountId: account.id },
            })
          }
        >
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <View style={{ gap: 2, flex: 1 }}>
              <AppText variant="title3">Brokerage workspace</AppText>
              <AppText variant="footnote" tone="secondary">
                Positions, operations, activity, and allocation.
              </AppText>
            </View>
            <Ionicons
              name="chevron-forward"
              size={18}
              color={colors.textSecondary}
            />
          </View>
        </Card>
      ) : null}

      {reconciliation ? (
        <Section kicker="Trust" title="Reconciliation">
          <ReconciliationCard
            reconciliation={reconciliation}
            onAdjust={() =>
              runAction(() => adjustMutation.mutateAsync(account.id))
            }
            onBaseline={() =>
              runAction(() => baselineMutation.mutateAsync(account.id))
            }
            adjustPending={adjustMutation.isPending}
            baselinePending={baselineMutation.isPending}
          />
        </Section>
      ) : null}

      <Section
        kicker="Recent"
        title="Latest activity"
        action={
          <IconButton
            accessibilityLabel="Add transaction"
            icon={<Ionicons name="add" size={18} color={colors.textPrimary} />}
            onPress={() => router.push("/transactions/upsert")}
          />
        }
      >
        {transactionsQuery.isPending ? (
          <SkeletonCard lines={3} />
        ) : transactionsQuery.data && transactionsQuery.data.length > 0 ? (
          <Card style={{ paddingVertical: 4 }}>
            {transactionsQuery.data.map((transaction, index) => {
              const signed = signedTransactionAmount(transaction);
              return (
                <ListRow
                  key={transaction.id}
                  title={transaction.description}
                  subtitle={`${format.date(localDateOf(transaction.postedAt))} • ${transactionSubtitle(transaction, accountNames)}`}
                  showDivider={index < transactionsQuery.data.length - 1}
                  onPress={() =>
                    router.push({
                      pathname: "/transactions/upsert",
                      params: { id: transaction.id },
                    })
                  }
                  right={
                    <MoneyText
                      amount={signed ?? transaction.amount}
                      currency={transaction.currency}
                      variant="footnoteMedium"
                      colorBySign={signed !== null}
                      signDisplay={signed !== null ? "exceptZero" : "auto"}
                      tone={signed === null ? "secondary" : undefined}
                    />
                  }
                />
              );
            })}
          </Card>
        ) : (
          <Card surface="muted">
            <AppText variant="footnote" tone="secondary">
              No activity in this account yet.
            </AppText>
          </Card>
        )}
      </Section>

      {actionError ? (
        <Card surface="danger">
          <AppText variant="footnote" tone="danger">
            {actionError}
          </AppText>
        </Card>
      ) : null}

      <Section kicker="Manage" title="Account actions">
        <View style={{ gap: spacing.sm }}>
          {isArchived ? (
            <Button
              label="Restore account"
              variant="secondary"
              onPress={() =>
                runAction(() => unarchiveMutation.mutateAsync(account.id))
              }
              loading={unarchiveMutation.isPending}
            />
          ) : (
            <Button
              label="Archive account"
              variant="secondary"
              onPress={() => setConfirmArchive(true)}
            />
          )}
          {account.canDeletePermanently ? (
            <Button
              label="Delete permanently"
              variant="danger"
              onPress={() => setConfirmDelete(true)}
            />
          ) : account.deleteBlockReason ? (
            <AppText variant="caption" tone="tertiary">
              Permanent delete unavailable: {account.deleteBlockReason}
            </AppText>
          ) : null}
        </View>
      </Section>

      <Sheet
        visible={confirmArchive}
        onClose={() => setConfirmArchive(false)}
        title="Archive account?"
      >
        <View style={{ gap: spacing.lg, paddingBottom: spacing.lg }}>
          <AppText variant="footnote" tone="secondary">
            “{account.name}” keeps its history and can be restored later, but
            stops appearing in pickers and totals stay intact.
          </AppText>
          <Button
            label="Archive"
            variant="danger"
            loading={archiveMutation.isPending}
            onPress={() =>
              runAction(
                () => archiveMutation.mutateAsync(account.id),
                () => {
                  setConfirmArchive(false);
                },
              )
            }
          />
          <Button
            label="Keep active"
            variant="secondary"
            onPress={() => setConfirmArchive(false)}
          />
        </View>
      </Sheet>

      <Sheet
        visible={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="Delete permanently?"
      >
        <View style={{ gap: spacing.lg, paddingBottom: spacing.lg }}>
          <AppText variant="footnote" tone="secondary">
            “{account.name}” is removed for good. This is only possible while
            nothing references the account.
          </AppText>
          <Button
            label="Delete forever"
            variant="danger"
            loading={deleteMutation.isPending}
            onPress={() =>
              runAction(
                () => deleteMutation.mutateAsync(account.id),
                () => {
                  setConfirmDelete(false);
                  router.back();
                },
              )
            }
          />
          <Button
            label="Cancel"
            variant="secondary"
            onPress={() => setConfirmDelete(false)}
          />
        </View>
      </Sheet>
    </Screen>
  );
}
