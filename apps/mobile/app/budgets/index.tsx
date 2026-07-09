import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import type {
  MonthlyBudgetItemResponse,
  MonthlyBudgetUnbudgetedCategoryResponse,
} from "@finhance/shared";

import { useMonthlyBudget } from "@/api/queries";
import {
  AppText,
  Card,
  Chip,
  Divider,
  EmptyState,
  ErrorState,
  IconButton,
  ListRow,
  MoneyText,
  MonthSwitcher,
  ProgressBar,
  Screen,
  Section,
  SkeletonCard,
} from "@/components/ui";
import { currentMonth } from "@/lib/dates";
import { useFormatters } from "@/prefs";
import { spacing, useTheme } from "@/theme";

function categoryLabel(
  item: Pick<
    MonthlyBudgetItemResponse,
    "categoryName" | "primaryCategoryName" | "secondaryCategoryName"
  >,
): string {
  if (item.secondaryCategoryName && item.primaryCategoryName) {
    return `${item.primaryCategoryName} · ${item.secondaryCategoryName}`;
  }

  return item.categoryName;
}

function BudgetItemRow({
  item,
  month,
  showDivider,
}: {
  item: MonthlyBudgetItemResponse;
  month: string;
  showDivider: boolean;
}) {
  const router = useRouter();
  const { colors, hideMoney } = useTheme();
  const format = useFormatters();
  const ratio = item.usageRatio;
  const over = item.status === "OVER_BUDGET";
  const atLimit = item.status === "AT_LIMIT";

  return (
    <View
      style={{
        paddingVertical: 12,
        gap: 7,
        borderBottomWidth: showDivider ? 1 : 0,
        borderBottomColor: colors.border,
      }}
    >
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
          gap: spacing.md,
        }}
      >
        <View style={{ flex: 1, minWidth: 0 }}>
          <AppText variant="bodyMedium" numberOfLines={1}>
            {categoryLabel(item)}
          </AppText>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          {item.override ? <Chip label="override" tone="info" /> : null}
          <IconButton
            accessibilityLabel={`Edit budget for ${item.categoryName}`}
            icon={
              <Ionicons
                name="create-outline"
                size={15}
                color={colors.textSecondary}
              />
            }
            onPress={() =>
              router.push({
                pathname: "/budgets/upsert",
                params: { id: item.budgetId, month },
              })
            }
            style={{ width: 30, height: 30, borderRadius: 15 }}
          />
        </View>
      </View>
      <ProgressBar
        ratio={ratio}
        tone={over ? "danger" : atLimit ? "warning" : "accent"}
      />
      <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
        <AppText variant="caption" tone="tertiary">
          {format.money(item.spentAmount, item.currency, {
            hide: hideMoney,
            maximumFractionDigits: 0,
          })}{" "}
          of{" "}
          {format.money(item.budgetAmount, item.currency, {
            hide: hideMoney,
            maximumFractionDigits: 0,
          })}
        </AppText>
        <AppText variant="caption" tone={over ? "danger" : "tertiary"} tabular>
          {over
            ? `${format.money(Math.abs(item.remainingAmount), item.currency, {
                hide: hideMoney,
                maximumFractionDigits: 0,
              })} over`
            : `${format.money(item.remainingAmount, item.currency, {
                hide: hideMoney,
                maximumFractionDigits: 0,
              })} left`}
        </AppText>
      </View>
    </View>
  );
}

function UnbudgetedRow({
  entry,
  month,
  showDivider,
}: {
  entry: MonthlyBudgetUnbudgetedCategoryResponse;
  month: string;
  showDivider: boolean;
}) {
  const router = useRouter();

  return (
    <ListRow
      showDivider={showDivider}
      title={categoryLabel({
        categoryName: entry.categoryName,
        primaryCategoryName: entry.primaryCategoryName,
        secondaryCategoryName: entry.secondaryCategoryName,
      })}
      subtitle="No budget set"
      right={
        <MoneyText
          amount={entry.spentAmount}
          currency={entry.currency}
          variant="footnoteMedium"
          tone="secondary"
        />
      }
      onPress={() =>
        router.push({
          pathname: "/budgets/upsert",
          params: {
            categoryId: entry.categoryId,
            currency: entry.currency,
            month,
          },
        })
      }
    />
  );
}

export default function BudgetsScreen() {
  const router = useRouter();
  const { colors, hideMoney } = useTheme();
  const format = useFormatters();
  const [month, setMonth] = useState(currentMonth());
  const budgetQuery = useMonthlyBudget(month);

  const data = budgetQuery.data;

  return (
    <Screen
      kicker="Plans"
      title="Budgets"
      showBack
      withTabBarClearance
      refreshing={budgetQuery.isRefetching}
      onRefresh={() => budgetQuery.refetch()}
      headerRight={
        <IconButton
          accessibilityLabel="Add budget"
          icon={<Ionicons name="add" size={20} color={colors.textPrimary} />}
          onPress={() =>
            router.push({ pathname: "/budgets/upsert", params: { month } })
          }
        />
      }
    >
      <MonthSwitcher month={month} onChange={setMonth} />

      {budgetQuery.isPending ? (
        <>
          <SkeletonCard lines={3} />
          <SkeletonCard lines={4} />
        </>
      ) : budgetQuery.isError || !data ? (
        <ErrorState
          error={budgetQuery.error}
          onRetry={() => budgetQuery.refetch()}
        />
      ) : data.currencies.length === 0 ? (
        <EmptyState
          icon="pie-chart-outline"
          title="No budgets this month"
          description="Set a monthly target for an expense category to track spending against a plan."
          actionLabel="Create a budget"
          onAction={() =>
            router.push({ pathname: "/budgets/upsert", params: { month } })
          }
        />
      ) : (
        data.currencies.map((currencySummary) => {
          const overallRatio =
            currencySummary.budgetTotal > 0
              ? currencySummary.spentTotal / currencySummary.budgetTotal
              : null;

          return (
            <View key={currencySummary.currency} style={{ gap: spacing.xl }}>
              <Card>
                <View style={{ gap: spacing.md }}>
                  <View
                    style={{
                      flexDirection: "row",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                  >
                    <AppText variant="kicker" tone="tertiary">
                      {currencySummary.currency} ·{" "}
                      {currencySummary.budgetedCategoryCount} budgeted
                    </AppText>
                    {currencySummary.overBudgetCount > 0 ? (
                      <Chip
                        label={`${currencySummary.overBudgetCount} over`}
                        tone="danger"
                      />
                    ) : (
                      <Chip label="On track" tone="success" />
                    )}
                  </View>
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "baseline",
                      gap: spacing.sm,
                    }}
                  >
                    <MoneyText
                      amount={currencySummary.spentTotal}
                      currency={currencySummary.currency}
                      variant="title1"
                      maximumFractionDigits={0}
                    />
                    <AppText variant="footnote" tone="tertiary">
                      of{" "}
                      {format.money(
                        currencySummary.budgetTotal,
                        currencySummary.currency,
                        { hide: hideMoney, maximumFractionDigits: 0 },
                      )}
                    </AppText>
                  </View>
                  <ProgressBar
                    ratio={overallRatio}
                    tone={
                      overallRatio !== null && overallRatio > 1
                        ? "danger"
                        : overallRatio !== null && overallRatio > 0.9
                          ? "warning"
                          : "accent"
                    }
                  />
                  <Divider />
                  <View
                    style={{
                      flexDirection: "row",
                      justifyContent: "space-between",
                      flexWrap: "wrap",
                      gap: spacing.sm,
                    }}
                  >
                    <AppText variant="caption" tone="tertiary">
                      Remaining{" "}
                      {format.money(
                        currencySummary.remainingTotal,
                        currencySummary.currency,
                        { hide: hideMoney, maximumFractionDigits: 0 },
                      )}
                    </AppText>
                    {currencySummary.unbudgetedExpenseTotal > 0 ? (
                      <AppText variant="caption" tone="tertiary">
                        Unbudgeted{" "}
                        {format.money(
                          currencySummary.unbudgetedExpenseTotal,
                          currencySummary.currency,
                          { hide: hideMoney, maximumFractionDigits: 0 },
                        )}
                      </AppText>
                    ) : null}
                    {currencySummary.uncategorizedExpenseTotal > 0 ? (
                      <AppText variant="caption" tone="warning">
                        Uncategorised{" "}
                        {format.money(
                          currencySummary.uncategorizedExpenseTotal,
                          currencySummary.currency,
                          { hide: hideMoney, maximumFractionDigits: 0 },
                        )}
                      </AppText>
                    ) : null}
                  </View>
                </View>
              </Card>

              {currencySummary.items.length > 0 ? (
                <Section
                  kicker={currencySummary.currency}
                  title="Category budgets"
                >
                  <Card style={{ paddingVertical: 4 }}>
                    {currencySummary.items.map((item, index) => (
                      <BudgetItemRow
                        key={item.budgetId}
                        item={item}
                        month={month}
                        showDivider={index < currencySummary.items.length - 1}
                      />
                    ))}
                  </Card>
                </Section>
              ) : null}

              {currencySummary.unbudgetedCategories.length > 0 ? (
                <Section
                  kicker={currencySummary.currency}
                  title="Spent without a budget"
                  description="Tap a category to give it a monthly plan."
                >
                  <Card style={{ paddingVertical: 4 }}>
                    {currencySummary.unbudgetedCategories.map(
                      (entry, index) => (
                        <UnbudgetedRow
                          key={`${entry.categoryId}-${entry.currency}`}
                          entry={entry}
                          month={month}
                          showDivider={
                            index <
                            currencySummary.unbudgetedCategories.length - 1
                          }
                        />
                      ),
                    )}
                  </Card>
                </Section>
              ) : null}
            </View>
          );
        })
      )}
    </Screen>
  );
}
