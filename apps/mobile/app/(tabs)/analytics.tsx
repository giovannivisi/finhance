import { useMemo, useState } from "react";
import { View } from "react-native";
import type { CashflowAnalyticsCurrencyResponse } from "@finhance/shared";

import { useCashflowAnalytics } from "@/api/queries";
import {
  BreakdownBars,
  MonthlyFlowChart,
  Sparkline,
} from "@/components/charts";
import {
  AppText,
  Card,
  Divider,
  EmptyState,
  ErrorState,
  MoneyText,
  Screen,
  SegmentedControl,
  Section,
  SkeletonCard,
  Stat,
} from "@/components/ui";
import {
  addMonths,
  currentMonth,
  formatMonthLabel,
} from "@/lib/dates";
import { spacing, useTheme } from "@/theme";

const RANGE_OPTIONS = [
  { value: "3", label: "3 months" },
  { value: "6", label: "6 months" },
  { value: "12", label: "12 months" },
] as const;

type RangeValue = (typeof RANGE_OPTIONS)[number]["value"];

function CurrencyAnalytics({
  summary,
  focusMonth,
}: {
  summary: CashflowAnalyticsCurrencyResponse;
  focusMonth: string;
}) {
  const { colors } = useTheme();

  const flowPoints = summary.monthlySeries.map((point) => ({
    month: point.month,
    income: point.incomeTotal,
    expense: point.expenseTotal,
    net: point.netCashflow,
  }));

  const expenseBreakdown = summary.focusMonthExpenseBreakdown.map((item) => ({
    key: item.categoryId ?? `uncat-${item.name}`,
    label:
      item.primaryCategoryName && item.secondaryCategoryName
        ? `${item.primaryCategoryName} · ${item.secondaryCategoryName}`
        : item.name,
    value: item.total,
  }));

  const incomeBreakdown = summary.focusMonthIncomeBreakdown.map((item) => ({
    key: item.categoryId ?? `uncat-${item.name}`,
    label:
      item.primaryCategoryName && item.secondaryCategoryName
        ? `${item.primaryCategoryName} · ${item.secondaryCategoryName}`
        : item.name,
    value: item.total,
  }));

  const topMovers = [...summary.expenseMonthOverMonthChanges]
    .sort((left, right) => Math.abs(right.delta) - Math.abs(left.delta))
    .slice(0, 5);

  const expenseTrends = summary.expenseCategoryTrends.slice(0, 5);

  return (
    <View style={{ gap: spacing.xl }}>
      <Card>
        <View style={{ gap: spacing.lg }}>
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <AppText variant="kicker" tone="tertiary">
              {summary.currency} · monthly flow
            </AppText>
            <View style={{ flexDirection: "row", gap: spacing.md }}>
              <View
                style={{ flexDirection: "row", alignItems: "center", gap: 4 }}
              >
                <View
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: 2,
                    backgroundColor: colors.chartIncome,
                  }}
                />
                <AppText variant="caption" tone="tertiary">
                  In
                </AppText>
              </View>
              <View
                style={{ flexDirection: "row", alignItems: "center", gap: 4 }}
              >
                <View
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: 2,
                    backgroundColor: colors.chartExpense,
                  }}
                />
                <AppText variant="caption" tone="tertiary">
                  Out
                </AppText>
              </View>
            </View>
          </View>
          <MonthlyFlowChart points={flowPoints} currency={summary.currency} />
          <Divider />
          <View style={{ flexDirection: "row", gap: spacing.xl }}>
            <Stat
              label="Avg monthly income"
              value={
                <MoneyText
                  amount={summary.averageMonthlyIncome}
                  currency={summary.currency}
                  variant="title3"
                  maximumFractionDigits={0}
                />
              }
              style={{ flex: 1 }}
            />
            <Stat
              label="Avg monthly spend"
              value={
                <MoneyText
                  amount={summary.averageMonthlyExpense}
                  currency={summary.currency}
                  variant="title3"
                  maximumFractionDigits={0}
                />
              }
              style={{ flex: 1 }}
            />
          </View>
        </View>
      </Card>

      {expenseBreakdown.length > 0 ? (
        <Section kicker={formatMonthLabel(focusMonth)} title="Where money went">
          <Card>
            <BreakdownBars
              data={expenseBreakdown}
              currency={summary.currency}
              tone="expense"
            />
          </Card>
        </Section>
      ) : null}

      {incomeBreakdown.length > 0 ? (
        <Section
          kicker={formatMonthLabel(focusMonth)}
          title="Where money came from"
        >
          <Card>
            <BreakdownBars
              data={incomeBreakdown}
              currency={summary.currency}
              tone="income"
            />
          </Card>
        </Section>
      ) : null}

      {topMovers.length > 0 ? (
        <Section
          kicker="Month over month"
          title="Biggest movers"
          description="Spending change versus the previous month."
        >
          <Card>
            <View style={{ gap: spacing.md }}>
              {topMovers.map((mover, index) => (
                <View
                  key={mover.categoryId ?? mover.name}
                  style={{ gap: spacing.sm }}
                >
                  {index > 0 ? <Divider /> : null}
                  <View
                    style={{
                      flexDirection: "row",
                      justifyContent: "space-between",
                      alignItems: "center",
                      gap: spacing.md,
                    }}
                  >
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <AppText variant="footnoteMedium" numberOfLines={1}>
                        {mover.primaryCategoryName &&
                        mover.secondaryCategoryName
                          ? `${mover.primaryCategoryName} · ${mover.secondaryCategoryName}`
                          : mover.name}
                      </AppText>
                      <AppText variant="caption" tone="tertiary">
                        {`${mover.previousTotal.toFixed(0)} → ${mover.currentTotal.toFixed(0)}`}
                      </AppText>
                    </View>
                    <MoneyText
                      amount={mover.delta}
                      currency={summary.currency}
                      variant="footnoteMedium"
                      signDisplay="exceptZero"
                      maximumFractionDigits={0}
                      tone={mover.delta > 0 ? "expense" : "income"}
                    />
                  </View>
                </View>
              ))}
            </View>
          </Card>
        </Section>
      ) : null}

      {expenseTrends.length > 0 ? (
        <Section
          kicker="Trends"
          title="Top spending categories"
          description="Across the selected range."
        >
          <Card>
            <View style={{ gap: spacing.md }}>
              {expenseTrends.map((trend, index) => (
                <View key={trend.categoryId ?? trend.name} style={{ gap: 6 }}>
                  {index > 0 ? <Divider /> : null}
                  <View
                    style={{
                      flexDirection: "row",
                      justifyContent: "space-between",
                      alignItems: "center",
                      gap: spacing.md,
                    }}
                  >
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <AppText variant="footnoteMedium" numberOfLines={1}>
                        {trend.primaryCategoryName &&
                        trend.secondaryCategoryName
                          ? `${trend.primaryCategoryName} · ${trend.secondaryCategoryName}`
                          : trend.name}
                      </AppText>
                      <MoneyText
                        amount={trend.total}
                        currency={summary.currency}
                        variant="caption"
                        tone="secondary"
                        maximumFractionDigits={0}
                      />
                    </View>
                    <Sparkline
                      values={trend.series.map((point) => point.total)}
                      tone="expense"
                    />
                  </View>
                </View>
              ))}
            </View>
          </Card>
        </Section>
      ) : null}
    </View>
  );
}

export default function AnalyticsScreen() {
  const [range, setRange] = useState<RangeValue>("6");

  const { from, to } = useMemo(() => {
    const thisMonth = currentMonth();
    const startMonth = addMonths(thisMonth, -(Number(range) - 1));
    return {
      from: startMonth,
      to: thisMonth,
    };
  }, [range]);

  const analyticsQuery = useCashflowAnalytics({ from, to });
  const data = analyticsQuery.data;

  return (
    <Screen
      kicker="Insights"
      title="Analytics"
      withTabBarClearance
      refreshing={analyticsQuery.isRefetching}
      onRefresh={() => analyticsQuery.refetch()}
    >
      <SegmentedControl
        options={RANGE_OPTIONS}
        value={range}
        onChange={setRange}
      />

      {analyticsQuery.isPending ? (
        <>
          <SkeletonCard lines={5} />
          <SkeletonCard lines={4} />
        </>
      ) : analyticsQuery.isError || !data ? (
        <ErrorState
          error={analyticsQuery.error}
          onRetry={() => analyticsQuery.refetch()}
        />
      ) : (
        <>
          {data.analytics.reportingOverview ? (
            <Card surface="muted">
              <View style={{ gap: spacing.md }}>
                <AppText variant="kicker" tone="tertiary">
                  All currencies ·{" "}
                  {data.analytics.reportingOverview.reportingCurrency}
                </AppText>
                <View style={{ flexDirection: "row", gap: spacing.xl }}>
                  <Stat
                    label={`${formatMonthLabel(data.analytics.focusMonth)} net`}
                    value={
                      <MoneyText
                        amount={
                          data.analytics.reportingOverview.focusMonthNetCashflow
                        }
                        currency={
                          data.analytics.reportingOverview.reportingCurrency
                        }
                        variant="title3"
                        colorBySign
                        signDisplay="exceptZero"
                        maximumFractionDigits={0}
                      />
                    }
                    style={{ flex: 1 }}
                  />
                  <Stat
                    label="Avg net"
                    value={
                      <MoneyText
                        amount={
                          data.analytics.reportingOverview
                            .averageMonthlyIncome -
                          data.analytics.reportingOverview.averageMonthlyExpense
                        }
                        currency={
                          data.analytics.reportingOverview.reportingCurrency
                        }
                        variant="title3"
                        colorBySign
                        signDisplay="exceptZero"
                        maximumFractionDigits={0}
                      />
                    }
                    style={{ flex: 1 }}
                  />
                </View>
              </View>
            </Card>
          ) : null}

          {data.analytics.currencies.length === 0 ? (
            <EmptyState
              icon="trending-up-outline"
              title="No cashflow yet"
              description="Analytics appear once transactions exist in the selected range."
            />
          ) : (
            data.analytics.currencies.map((summary) => (
              <CurrencyAnalytics
                key={summary.currency}
                summary={summary}
                focusMonth={data.analytics.focusMonth}
              />
            ))
          )}
        </>
      )}
    </Screen>
  );
}
