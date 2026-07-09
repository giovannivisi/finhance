import { useState } from "react";
import { View } from "react-native";

import { useMaterializeRecurring, useMonthlyReview } from "@/api/queries";
import {
  AppText,
  Button,
  Card,
  Chip,
  describeError,
  Divider,
  ErrorState,
  MoneyText,
  MonthSwitcher,
  Screen,
  Section,
  SkeletonCard,
  Stat,
} from "@/components/ui";
import { currentMonth } from "@/lib/dates";
import { useFormatters } from "@/prefs";
import { spacing, useTheme } from "@/theme";

export default function MonthlyReviewScreen() {
  const { hideMoney } = useTheme();
  const format = useFormatters();
  const [month, setMonth] = useState(currentMonth());
  const reviewQuery = useMonthlyReview(month);
  const materialize = useMaterializeRecurring();
  const [actionError, setActionError] = useState<string | null>(null);

  const data = reviewQuery.data;
  const review = data?.review;

  return (
    <Screen
      kicker="Monthly close"
      title="Review"
      showBack
      withTabBarClearance
      refreshing={reviewQuery.isRefetching}
      onRefresh={() => reviewQuery.refetch()}
    >
      <MonthSwitcher
        month={month}
        onChange={setMonth}
        maxMonth={currentMonth()}
      />

      {reviewQuery.isPending ? (
        <>
          <SkeletonCard lines={4} />
          <SkeletonCard lines={3} />
        </>
      ) : reviewQuery.isError || !review ? (
        <ErrorState
          error={reviewQuery.error}
          onRetry={() => reviewQuery.refetch()}
        />
      ) : (
        <>
          {data?.hasPendingSync ? (
            <Card surface="info">
              <View style={{ gap: spacing.sm }}>
                <AppText variant="footnote" tone="secondary">
                  Recurring rules have months that were never materialised.
                  Posting them keeps this review honest.
                </AppText>
                <Button
                  label="Materialise recurring now"
                  size="sm"
                  variant="secondary"
                  loading={materialize.isPending}
                  onPress={async () => {
                    setActionError(null);
                    try {
                      await materialize.mutateAsync();
                    } catch (error) {
                      setActionError(describeError(error));
                    }
                  }}
                />
                {actionError ? (
                  <AppText variant="caption" tone="danger">
                    {actionError}
                  </AppText>
                ) : null}
              </View>
            </Card>
          ) : null}

          <Card>
            <View style={{ gap: spacing.lg }}>
              <AppText variant="kicker" tone="tertiary">
                Net worth · {review.reportingCurrency}
              </AppText>
              <View style={{ flexDirection: "row", gap: spacing.xl }}>
                <Stat
                  label="Opening"
                  value={
                    review.openingNetWorth !== null ? (
                      <MoneyText
                        amount={review.openingNetWorth}
                        currency={review.reportingCurrency}
                        variant="title3"
                        maximumFractionDigits={0}
                      />
                    ) : (
                      "—"
                    )
                  }
                  note={
                    review.openingSnapshotDate
                      ? format.date(review.openingSnapshotDate.slice(0, 10))
                      : "No snapshot"
                  }
                  style={{ flex: 1 }}
                />
                <Stat
                  label="Closing"
                  value={
                    review.closingNetWorth !== null ? (
                      <MoneyText
                        amount={review.closingNetWorth}
                        currency={review.reportingCurrency}
                        variant="title3"
                        maximumFractionDigits={0}
                      />
                    ) : (
                      "—"
                    )
                  }
                  note={
                    review.closingSnapshotDate
                      ? format.date(review.closingSnapshotDate.slice(0, 10))
                      : "No snapshot"
                  }
                  style={{ flex: 1 }}
                />
                <Stat
                  label="Change"
                  value={
                    review.netWorthDelta !== null ? (
                      <MoneyText
                        amount={review.netWorthDelta}
                        currency={review.reportingCurrency}
                        variant="title3"
                        colorBySign
                        signDisplay="exceptZero"
                        maximumFractionDigits={0}
                      />
                    ) : (
                      "—"
                    )
                  }
                  style={{ flex: 1 }}
                />
              </View>

              {review.netWorthExplanation.isComparableInReportingCurrency &&
              review.netWorthDelta !== null ? (
                <>
                  <Divider />
                  <View style={{ gap: spacing.sm }}>
                    <View
                      style={{
                        flexDirection: "row",
                        justifyContent: "space-between",
                      }}
                    >
                      <AppText variant="footnote" tone="secondary">
                        From cashflow
                      </AppText>
                      <MoneyText
                        amount={
                          review.netWorthExplanation.cashflowContribution ?? 0
                        }
                        currency={review.reportingCurrency}
                        variant="footnoteMedium"
                        colorBySign
                        signDisplay="exceptZero"
                        maximumFractionDigits={0}
                      />
                    </View>
                    <View
                      style={{
                        flexDirection: "row",
                        justifyContent: "space-between",
                      }}
                    >
                      <AppText variant="footnote" tone="secondary">
                        Market & FX movement
                      </AppText>
                      <MoneyText
                        amount={
                          review.netWorthExplanation.marketAndFxMovement ?? 0
                        }
                        currency={review.reportingCurrency}
                        variant="footnoteMedium"
                        colorBySign
                        signDisplay="exceptZero"
                        maximumFractionDigits={0}
                      />
                    </View>
                  </View>
                </>
              ) : review.netWorthExplanation.note ? (
                <AppText variant="caption" tone="tertiary">
                  {review.netWorthExplanation.note}
                </AppText>
              ) : null}
            </View>
          </Card>

          {review.warnings.length > 0 ? (
            <Section kicker="Diagnostics" title="Things to check">
              <View style={{ gap: spacing.sm }}>
                {review.warnings.map((warning) => (
                  <Card
                    key={`${warning.code}-${warning.currency ?? ""}`}
                    surface={
                      warning.severity === "WARNING" ? "warning" : "info"
                    }
                  >
                    <View style={{ gap: 4 }}>
                      <View
                        style={{
                          flexDirection: "row",
                          justifyContent: "space-between",
                          alignItems: "center",
                          gap: spacing.sm,
                        }}
                      >
                        <AppText variant="footnoteMedium" style={{ flex: 1 }}>
                          {warning.title}
                        </AppText>
                        {warning.count !== null ? (
                          <Chip label={`${warning.count}`} tone="neutral" />
                        ) : null}
                      </View>
                      <AppText variant="caption" tone="secondary">
                        {warning.detail}
                      </AppText>
                    </View>
                  </Card>
                ))}
              </View>
            </Section>
          ) : null}

          {review.currencyInsights.map((insight) => {
            const cashflow = review.cashflow.find(
              (entry) => entry.currency === insight.currency,
            );

            return (
              <Section
                key={insight.currency}
                kicker={insight.currency}
                title="Cashflow"
              >
                <Card>
                  <View style={{ gap: spacing.md }}>
                    {cashflow ? (
                      <View style={{ flexDirection: "row", gap: spacing.xl }}>
                        <Stat
                          label="In"
                          value={
                            <MoneyText
                              amount={cashflow.incomeTotal}
                              currency={insight.currency}
                              variant="title3"
                              tone="income"
                              maximumFractionDigits={0}
                            />
                          }
                          style={{ flex: 1 }}
                        />
                        <Stat
                          label="Out"
                          value={
                            <MoneyText
                              amount={cashflow.expenseTotal}
                              currency={insight.currency}
                              variant="title3"
                              tone="expense"
                              maximumFractionDigits={0}
                            />
                          }
                          style={{ flex: 1 }}
                        />
                        <Stat
                          label="Savings rate"
                          value={
                            insight.savingsRate !== null
                              ? `${Math.round(insight.savingsRate * 100)}%`
                              : "—"
                          }
                          style={{ flex: 1 }}
                        />
                      </View>
                    ) : null}

                    {insight.topExpenseCategories.length > 0 ? (
                      <>
                        <Divider />
                        <View style={{ gap: spacing.sm }}>
                          <AppText variant="caption" tone="tertiary">
                            TOP SPENDING
                          </AppText>
                          {insight.topExpenseCategories
                            .slice(0, 4)
                            .map((category) => (
                              <View
                                key={category.categoryId ?? category.name}
                                style={{
                                  flexDirection: "row",
                                  justifyContent: "space-between",
                                  gap: spacing.md,
                                }}
                              >
                                <AppText
                                  variant="footnote"
                                  tone="secondary"
                                  numberOfLines={1}
                                  style={{ flex: 1 }}
                                >
                                  {category.primaryCategoryName &&
                                  category.secondaryCategoryName
                                    ? `${category.primaryCategoryName} · ${category.secondaryCategoryName}`
                                    : category.name}
                                </AppText>
                                <AppText variant="footnoteMedium" tabular>
                                  {format.money(
                                    category.total,
                                    insight.currency,
                                    {
                                      hide: hideMoney,
                                      maximumFractionDigits: 0,
                                    },
                                  )}
                                </AppText>
                              </View>
                            ))}
                        </View>
                      </>
                    ) : null}
                  </View>
                </Card>
              </Section>
            );
          })}

          {review.recurringComparison.length > 0 ? (
            <Section
              kicker="Recurring"
              title="Expected vs actual"
              description="How materialised recurring rules compare with the plan."
            >
              <View style={{ gap: spacing.sm }}>
                {review.recurringComparison.map((comparison) => (
                  <Card key={comparison.currency}>
                    <View style={{ gap: spacing.md }}>
                      <View
                        style={{
                          flexDirection: "row",
                          justifyContent: "space-between",
                          alignItems: "center",
                        }}
                      >
                        <AppText variant="footnoteMedium" tone="secondary">
                          {comparison.currency}
                        </AppText>
                        <AppText variant="caption" tone="tertiary">
                          {comparison.realizedRuleCount}/
                          {comparison.dueRuleCount} rules realised
                          {comparison.skippedCount > 0
                            ? ` · ${comparison.skippedCount} skipped`
                            : ""}
                          {comparison.overriddenCount > 0
                            ? ` · ${comparison.overriddenCount} overridden`
                            : ""}
                        </AppText>
                      </View>
                      <View style={{ flexDirection: "row", gap: spacing.xl }}>
                        <Stat
                          label="Income plan"
                          value={
                            <AppText variant="footnoteMedium" tabular>
                              {format.money(
                                comparison.actualIncomeTotal,
                                comparison.currency,
                                { hide: hideMoney, maximumFractionDigits: 0 },
                              )}{" "}
                              /{" "}
                              {format.money(
                                comparison.expectedIncomeTotal,
                                comparison.currency,
                                { hide: hideMoney, maximumFractionDigits: 0 },
                              )}
                            </AppText>
                          }
                          style={{ flex: 1 }}
                        />
                        <Stat
                          label="Expense plan"
                          value={
                            <AppText variant="footnoteMedium" tabular>
                              {format.money(
                                comparison.actualExpenseTotal,
                                comparison.currency,
                                { hide: hideMoney, maximumFractionDigits: 0 },
                              )}{" "}
                              /{" "}
                              {format.money(
                                comparison.expectedExpenseTotal,
                                comparison.currency,
                                { hide: hideMoney, maximumFractionDigits: 0 },
                              )}
                            </AppText>
                          }
                          style={{ flex: 1 }}
                        />
                      </View>
                    </View>
                  </Card>
                ))}
              </View>
            </Section>
          ) : null}

          {review.budgetHighlights.length > 0 ? (
            <Section kicker="Budgets" title="Over-budget categories">
              <Card style={{ paddingVertical: 4 }}>
                {review.budgetHighlights.map((item, index) => (
                  <View
                    key={item.budgetId}
                    style={{
                      flexDirection: "row",
                      justifyContent: "space-between",
                      paddingVertical: 12,
                      gap: spacing.md,
                      borderBottomWidth:
                        index < review.budgetHighlights.length - 1 ? 1 : 0,
                      borderBottomColor: "rgba(127,127,127,0.2)",
                    }}
                  >
                    <AppText
                      variant="footnote"
                      tone="secondary"
                      numberOfLines={1}
                      style={{ flex: 1 }}
                    >
                      {item.primaryCategoryName && item.secondaryCategoryName
                        ? `${item.primaryCategoryName} · ${item.secondaryCategoryName}`
                        : item.categoryName}
                    </AppText>
                    <AppText variant="footnoteMedium" tone="danger" tabular>
                      {format.money(
                        Math.abs(item.remainingAmount),
                        item.currency,
                        { hide: hideMoney, maximumFractionDigits: 0 },
                      )}{" "}
                      over
                    </AppText>
                  </View>
                ))}
              </Card>
            </Section>
          ) : null}

          {review.reconciliationHighlights.length > 0 ? (
            <Section kicker="Trust" title="Accounts out of balance">
              <Card style={{ paddingVertical: 4 }}>
                {review.reconciliationHighlights.map((entry, index) => (
                  <View
                    key={entry.accountId}
                    style={{
                      flexDirection: "row",
                      justifyContent: "space-between",
                      paddingVertical: 12,
                      gap: spacing.md,
                      borderBottomWidth:
                        index < review.reconciliationHighlights.length - 1
                          ? 1
                          : 0,
                      borderBottomColor: "rgba(127,127,127,0.2)",
                    }}
                  >
                    <AppText
                      variant="footnote"
                      tone="secondary"
                      numberOfLines={1}
                      style={{ flex: 1 }}
                    >
                      {entry.accountName}
                    </AppText>
                    {entry.delta !== null ? (
                      <MoneyText
                        amount={entry.delta}
                        currency={entry.currency}
                        variant="footnoteMedium"
                        colorBySign
                        signDisplay="exceptZero"
                      />
                    ) : (
                      <Chip label="Check" tone="warning" />
                    )}
                  </View>
                ))}
              </Card>
            </Section>
          ) : null}
        </>
      )}
    </Screen>
  );
}
