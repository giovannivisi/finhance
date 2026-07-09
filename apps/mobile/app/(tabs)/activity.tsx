import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { TextInput, View } from "react-native";
import type { TransactionResponse } from "@finhance/shared";

import { useTransactionsPage, useUserSettings } from "@/api/queries";
import {
  AppText,
  Card,
  Chip,
  ChipRow,
  EmptyState,
  ErrorState,
  IconButton,
  ListRow,
  MoneyText,
  MonthSwitcher,
  OptionSheet,
  Screen,
  SkeletonCard,
  SwitchField,
  Sheet,
} from "@/components/ui";
import {
  buildAccountNameMap,
  buildSearchEntries,
  filterBySearch,
  groupTransactionsByDay,
  signedTransactionAmount,
  transactionSubtitle,
} from "@/features/transactions/derive";
import {
  activityCategoryFilterQuery,
  activityCategoryFilterValue,
  categoryLabel,
  type ActivityCategoryFilterValue,
} from "@/lib/categories";
import {
  currentMonth,
  monthBounds,
} from "@/lib/dates";
import { useFormatters } from "@/prefs";
import { fonts, radius, spacing, useTheme } from "@/theme";

const KIND_FILTERS = [
  { value: "ALL", label: "All" },
  { value: "EXPENSE", label: "Expenses" },
  { value: "INCOME", label: "Income" },
  { value: "TRANSFER", label: "Transfers" },
  { value: "ADJUSTMENT", label: "Adjustments" },
] as const;

type KindFilter = (typeof KIND_FILTERS)[number]["value"];
type CategoryFilterOption = {
  value: ActivityCategoryFilterValue;
  label: string;
  detail?: string;
};

const KIND_ICONS: Record<
  TransactionResponse["kind"],
  {
    name: keyof typeof Ionicons.glyphMap;
    tone: "income" | "expense" | "info" | "secondary";
  }
> = {
  INCOME: { name: "arrow-down", tone: "income" },
  EXPENSE: { name: "arrow-up", tone: "expense" },
  TRANSFER: { name: "swap-horizontal", tone: "info" },
  ADJUSTMENT: { name: "options", tone: "secondary" },
};

function TransactionRow({
  transaction,
  accountNames,
  showTime,
  showDivider,
  onPress,
}: {
  transaction: TransactionResponse;
  accountNames: Map<string, string>;
  showTime: boolean;
  showDivider: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  const format = useFormatters();
  const icon = KIND_ICONS[transaction.kind];
  const signed = signedTransactionAmount(transaction);

  const iconColor =
    icon.tone === "income"
      ? colors.income
      : icon.tone === "expense"
        ? colors.expense
        : icon.tone === "info"
          ? colors.neutralAccent
          : colors.textSecondary;

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
          <Ionicons name={icon.name} size={17} color={iconColor} />
        </View>
      }
      title={transaction.description}
      subtitle={transactionSubtitle(transaction, accountNames)}
      right={
        <View style={{ alignItems: "flex-end", gap: 2 }}>
          {signed === null ? (
            <MoneyText
              amount={transaction.amount}
              currency={transaction.currency}
              variant="bodyMedium"
              tone="secondary"
            />
          ) : (
            <MoneyText
              amount={signed}
              currency={transaction.currency}
              variant="bodyMedium"
              colorBySign
              signDisplay="exceptZero"
            />
          )}
          <View style={{ flexDirection: "row", gap: 4, alignItems: "center" }}>
            {transaction.isRecurringGenerated ? (
              <Chip label="auto" tone="info" />
            ) : null}
            {showTime ? (
              <AppText variant="caption" tone="tertiary">
                {format.time(transaction.postedAt)}
              </AppText>
            ) : null}
          </View>
        </View>
      }
    />
  );
}

export default function ActivityScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const format = useFormatters();
  const [month, setMonth] = useState(currentMonth());
  const [kindFilter, setKindFilter] = useState<KindFilter>("ALL");
  const [accountFilter, setAccountFilter] = useState<string | null>(null);
  const [categoryFilter, setCategoryFilter] =
    useState<ActivityCategoryFilterValue>("ALL");
  const [includeArchived, setIncludeArchived] = useState(false);
  const [search, setSearch] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [accountSheetOpen, setAccountSheetOpen] = useState(false);
  const [categorySheetOpen, setCategorySheetOpen] = useState(false);

  const bounds = monthBounds(month);
  const filters = useMemo(
    () => ({
      from: bounds.from,
      to: bounds.to,
      kind: kindFilter === "ALL" ? undefined : kindFilter,
      accountId: accountFilter ?? undefined,
      ...activityCategoryFilterQuery(categoryFilter),
      includeArchivedAccounts: includeArchived || undefined,
      limit: 500,
    }),
    [
      bounds.from,
      bounds.to,
      kindFilter,
      accountFilter,
      categoryFilter,
      includeArchived,
    ],
  );

  const pageQuery = useTransactionsPage(filters);
  const settingsQuery = useUserSettings();
  const showTime = settingsQuery.data?.showTransactionTimes ?? false;

  const data = pageQuery.data;
  const accountNames = useMemo(
    () => buildAccountNameMap(data?.accounts ?? []),
    [data?.accounts],
  );

  const visibleTransactions = useMemo(() => {
    if (!data) {
      return [];
    }
    const entries = buildSearchEntries(data.transactions, accountNames);
    return filterBySearch(entries, search);
  }, [data, accountNames, search]);

  const dayGroups = useMemo(
    () => groupTransactionsByDay(visibleTransactions),
    [visibleTransactions],
  );

  const accountOptions = useMemo(
    () => [
      { value: "ALL", label: "All accounts" },
      ...(data?.accounts ?? [])
        .filter((account) => includeArchived || !account.archivedAt)
        .map((account) => ({
          value: account.id,
          label: account.name,
          detail: account.archivedAt ? "Archived" : account.currency,
        })),
    ],
    [data?.accounts, includeArchived],
  );

  const categoryOptions = useMemo<CategoryFilterOption[]>(
    () => [
      { value: "ALL", label: "All categories" },
      ...(data?.categories ?? [])
        .filter((category) => !category.archivedAt)
        .map((category) => ({
          value: activityCategoryFilterValue(category),
          label: categoryLabel(category),
          detail: category.type === "EXPENSE" ? "Expense" : "Income",
        })),
    ],
    [data?.categories],
  );

  const activeFilterCount =
    (accountFilter ? 1 : 0) +
    (categoryFilter !== "ALL" ? 1 : 0) +
    (includeArchived ? 1 : 0);

  const monthCashflow = data?.cashflow ?? [];

  return (
    <Screen
      kicker="Transactions"
      title="Activity"
      withTabBarClearance
      refreshing={pageQuery.isRefetching}
      onRefresh={() => pageQuery.refetch()}
      headerRight={
        <>
          <IconButton
            accessibilityLabel="Filters"
            icon={
              <View>
                <Ionicons
                  name="funnel-outline"
                  size={17}
                  color={colors.textPrimary}
                />
                {activeFilterCount > 0 ? (
                  <View
                    style={{
                      position: "absolute",
                      top: -3,
                      right: -4,
                      width: 8,
                      height: 8,
                      borderRadius: 4,
                      backgroundColor: colors.primary,
                    }}
                  />
                ) : null}
              </View>
            }
            onPress={() => setFiltersOpen(true)}
          />
          <IconButton
            accessibilityLabel="Add transaction"
            icon={<Ionicons name="add" size={20} color={colors.textPrimary} />}
            onPress={() => router.push("/transactions/upsert")}
          />
        </>
      }
    >
      <MonthSwitcher month={month} onChange={setMonth} />

      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: spacing.sm,
          backgroundColor: colors.bgControl,
          borderColor: colors.borderControl,
          borderWidth: 1,
          borderRadius: radius.control,
          paddingHorizontal: spacing.lg,
          minHeight: 44,
        }}
      >
        <Ionicons name="search" size={16} color={colors.textTertiary} />
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Search description, payee, notes…"
          placeholderTextColor={colors.textTertiary}
          autoCapitalize="none"
          autoCorrect={false}
          style={{
            flex: 1,
            color: colors.textPrimary,
            fontFamily: fonts.regular,
            fontSize: 14.5,
            paddingVertical: 8,
          }}
        />
        {search ? (
          <Ionicons
            name="close-circle"
            size={16}
            color={colors.textTertiary}
            onPress={() => setSearch("")}
          />
        ) : null}
      </View>

      <ChipRow
        options={KIND_FILTERS}
        value={kindFilter}
        onChange={setKindFilter}
      />

      {pageQuery.isPending ? (
        <>
          <SkeletonCard lines={2} />
          <SkeletonCard lines={4} />
        </>
      ) : pageQuery.isError || !data ? (
        <ErrorState
          error={pageQuery.error}
          onRetry={() => pageQuery.refetch()}
        />
      ) : (
        <>
          {monthCashflow.length > 0 && !search ? (
            <Card surface="muted">
              <View style={{ gap: spacing.md }}>
                {monthCashflow.map((currencySummary) => (
                  <View
                    key={currencySummary.currency}
                    style={{
                      flexDirection: "row",
                      justifyContent: "space-between",
                      alignItems: "center",
                      gap: spacing.md,
                    }}
                  >
                    <AppText variant="footnoteMedium" tone="secondary">
                      {currencySummary.currency}
                    </AppText>
                    <View style={{ flexDirection: "row", gap: spacing.lg }}>
                      <View style={{ alignItems: "flex-end" }}>
                        <AppText variant="caption" tone="tertiary">
                          In
                        </AppText>
                        <MoneyText
                          amount={currencySummary.incomeTotal}
                          currency={currencySummary.currency}
                          variant="footnoteMedium"
                          tone="income"
                          maximumFractionDigits={0}
                        />
                      </View>
                      <View style={{ alignItems: "flex-end" }}>
                        <AppText variant="caption" tone="tertiary">
                          Out
                        </AppText>
                        <MoneyText
                          amount={currencySummary.expenseTotal}
                          currency={currencySummary.currency}
                          variant="footnoteMedium"
                          tone="expense"
                          maximumFractionDigits={0}
                        />
                      </View>
                      <View style={{ alignItems: "flex-end" }}>
                        <AppText variant="caption" tone="tertiary">
                          Net
                        </AppText>
                        <MoneyText
                          amount={currencySummary.netCashflow}
                          currency={currencySummary.currency}
                          variant="footnoteMedium"
                          colorBySign
                          signDisplay="exceptZero"
                          maximumFractionDigits={0}
                        />
                      </View>
                    </View>
                  </View>
                ))}
              </View>
            </Card>
          ) : null}

          {dayGroups.length === 0 ? (
            <EmptyState
              icon="receipt-outline"
              title={search ? "No matches" : "No transactions this month"}
              description={
                search
                  ? "Try a different search or clear the filters."
                  : "Record an expense, income, or transfer to see it here."
              }
              actionLabel={search ? undefined : "Add transaction"}
              onAction={
                search ? undefined : () => router.push("/transactions/upsert")
              }
            />
          ) : (
            dayGroups.map((group) => (
              <View key={group.date} style={{ gap: spacing.sm }}>
                <AppText variant="kicker" tone="tertiary">
                  {format.dayHeading(group.date)}
                </AppText>
                <Card style={{ paddingVertical: 4 }}>
                  {group.items.map((transaction, index) => (
                    <TransactionRow
                      key={transaction.id}
                      transaction={transaction}
                      accountNames={accountNames}
                      showTime={showTime}
                      showDivider={index < group.items.length - 1}
                      onPress={() =>
                        router.push({
                          pathname: "/transactions/upsert",
                          params: { id: transaction.id },
                        })
                      }
                    />
                  ))}
                </Card>
              </View>
            ))
          )}
        </>
      )}

      <Sheet
        visible={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        title="Filters"
      >
        <View style={{ gap: spacing.lg, paddingBottom: spacing.lg }}>
          <ListRow
            title="Account"
            subtitle={
              accountFilter
                ? (accountNames.get(accountFilter) ?? "Unknown")
                : "All accounts"
            }
            onPress={() => setAccountSheetOpen(true)}
            right={
              <Ionicons
                name="chevron-forward"
                size={16}
                color={colors.textTertiary}
              />
            }
          />
          <ListRow
            title="Category"
            subtitle={
              categoryFilter !== "ALL"
                ? (categoryOptions.find(
                    (option) => option.value === categoryFilter,
                  )?.label ?? "Unknown")
                : "All categories"
            }
            onPress={() => setCategorySheetOpen(true)}
            right={
              <Ionicons
                name="chevron-forward"
                size={16}
                color={colors.textTertiary}
              />
            }
          />
          <SwitchField
            label="Include archived accounts"
            description="Show activity that belongs to archived accounts."
            value={includeArchived}
            onChange={setIncludeArchived}
          />
          {activeFilterCount > 0 ? (
            <ListRow
              title="Clear filters"
              onPress={() => {
                setAccountFilter(null);
                setCategoryFilter("ALL");
                setIncludeArchived(false);
                setFiltersOpen(false);
              }}
              right={
                <Ionicons name="close" size={16} color={colors.textTertiary} />
              }
            />
          ) : null}
        </View>
      </Sheet>

      <OptionSheet
        visible={accountSheetOpen}
        onClose={() => setAccountSheetOpen(false)}
        title="Account"
        options={accountOptions}
        selectedValue={accountFilter ?? "ALL"}
        onSelect={(value) => setAccountFilter(value === "ALL" ? null : value)}
      />
      <OptionSheet
        visible={categorySheetOpen}
        onClose={() => setCategorySheetOpen(false)}
        title="Category"
        options={categoryOptions}
        selectedValue={categoryFilter}
        onSelect={setCategoryFilter}
      />
    </Screen>
  );
}
