import Link from "next/link";
import type {
  AccountResponse,
  CashflowAnalyticsResponse,
  CategoryResponse,
  RecurringPendingStatusResponse,
  SetupStatusResponse,
} from "@finhance/shared";
import AnalyticsCategoryBarChart from "@components/AnalyticsCategoryBarChart";
import AnalyticsTrendChart from "@components/AnalyticsTrendChart";
import Container from "@components/Container";
import FilterResetButton from "@components/FilterResetButton";
import MoneyValue from "@components/MoneyValue";
import RecurringMaterializeButton from "@components/RecurringMaterializeButton";
import Sparkline from "@components/Sparkline";

import WorkflowSection from "@components/WorkflowSection";
import { api } from "@lib/server-api";
import {
  buildAnalyticsQueryString,
  buildTransactionsLink,
  getDefaultAnalyticsFilters,
  getAnalyticsFilters,
  getMonthDateRange,
} from "@lib/analytics";
import { formatCategoryName } from "@lib/categories";
import { formatCurrency } from "@lib/format";
import {
  expensePrimaryCategories,
  expenseSecondaryCategories,
  formatHierarchyName,
  incomeCategories,
} from "@lib/hierarchical-categories";
import { getWorkflowCards } from "@lib/workflow";

export const dynamic = "force-dynamic";

type RawSearchParams = Promise<Record<string, string | string[] | undefined>>;

type TrendDelta =
  | { kind: "pct"; value: number; direction: "up" | "down" | "flat" }
  | { kind: "from-zero"; direction: "up" | "flat" }
  | null;

function trendDelta(series: ReadonlyArray<{ total: number }>): TrendDelta {
  if (series.length < 2) {
    return null;
  }
  const first = series[0].total;
  const last = series[series.length - 1].total;
  if (first === 0) {
    if (last === 0) {
      return { kind: "pct", value: 0, direction: "flat" };
    }
    return { kind: "from-zero", direction: "up" };
  }
  const pct = ((last - first) / Math.abs(first)) * 100;
  const direction = pct > 0.5 ? "up" : pct < -0.5 ? "down" : "flat";
  return { kind: "pct", value: pct, direction };
}

function deltaToneClass(
  kind: "EXPENSE" | "INCOME",
  direction: "up" | "down" | "flat",
): string {
  if (direction === "flat") {
    return "text-gray-500";
  }
  const isFavorable =
    kind === "EXPENSE" ? direction === "down" : direction === "up";
  return isFavorable ? "text-emerald-600" : "text-rose-600";
}

const TREND_ROW_LIMIT = 5;

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams?: RawSearchParams;
}) {
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const filters = getAnalyticsFilters(resolvedSearchParams);
  const defaultFilters = getDefaultAnalyticsFilters();
  const queryString = buildAnalyticsQueryString(filters);
  const selectedRange = {
    from: `${filters.from}-01`,
    to: getMonthDateRange(filters.to).to,
  };

  let analytics: CashflowAnalyticsResponse | null = null;
  let accounts: AccountResponse[] | null = null;
  let categories: CategoryResponse[] | null = null;
  let setup: SetupStatusResponse | null = null;
  let hasPendingSync = false;
  let errorMessage: string | null = null;

  try {
    [analytics, accounts, categories] = await Promise.all([
      api<CashflowAnalyticsResponse>(`/cashflow/analytics?${queryString}`),
      api<AccountResponse[]>("/accounts?includeArchived=true"),
      api<CategoryResponse[]>("/categories?includeArchived=true"),
    ]);
  } catch (error) {
    errorMessage =
      error instanceof Error
        ? error.message
        : "Analytics data is currently unavailable.";
  }

  if (analytics) {
    const [resolvedSetup, pendingStatus] = await Promise.all([
      api<SetupStatusResponse>("/setup/status?includeWarnings=false").catch(
        () => null,
      ),
      api<RecurringPendingStatusResponse>("/recurring-rules/has-pending").catch(
        () => null,
      ),
    ]);
    setup = resolvedSetup;
    hasPendingSync = pendingStatus?.hasPending ?? false;
  }

  const visibleExpensePrimaries = categories
    ? expensePrimaryCategories(categories, filters.primaryCategoryId)
    : [];
  const visibleSecondaryCategories = categories
    ? filters.primaryCategoryId
      ? expenseSecondaryCategories(
          categories,
          filters.primaryCategoryId,
          filters.secondaryCategoryId,
        )
      : [
          ...incomeCategories(categories, filters.secondaryCategoryId),
          ...categories.filter(
            (category) =>
              category.type === "EXPENSE" &&
              category.isSecondary &&
              (category.archivedAt === null ||
                category.id === filters.secondaryCategoryId),
          ),
        ]
    : [];
  const hasActiveFilters =
    filters.from !== defaultFilters.from ||
    filters.to !== defaultFilters.to ||
    Boolean(filters.accountId) ||
    Boolean(filters.primaryCategoryId) ||
    Boolean(filters.secondaryCategoryId) ||
    filters.includeArchivedAccounts;
  const activeFilterCount = [
    filters.from !== defaultFilters.from,
    filters.to !== defaultFilters.to,
    Boolean(filters.accountId),
    Boolean(filters.primaryCategoryId),
    Boolean(filters.secondaryCategoryId),
    filters.includeArchivedAccounts,
  ].filter(Boolean).length;

  return (
    <>
      <Container>
        {!analytics || !accounts || !categories ? (
          <section className="page-shell">
            <div className="page-hero">
              <p className="page-kicker">Analysis</p>
              <h1 className="page-title is-compact">Analytics</h1>
            </div>
            <div className="page-inline-notice surface-warning">
              <p className="font-medium">
                The web app could not reach the API.
              </p>
              <p className="mt-2 text-sm">
                {errorMessage ?? "Start the API and refresh the page."}
              </p>
            </div>
          </section>
        ) : (
          <div className="page-shell is-relaxed route-stack-desktop-xl">
            <section className="page-hero">
              <div className="section-stack-relaxed">
                <div className="page-hero-copy analytics-hero-copy">
                  <p className="page-kicker">Analysis</p>
                  <div className="page-hero-row analytics-hero-title-row">
                    <h1 className="page-title is-compact">Analytics</h1>
                    <div className="page-pill">
                      Focus month {analytics.focusMonth}
                    </div>
                  </div>
                  <p className="page-description">
                    Multi-month cashflow trends, biggest category changes, and
                    drill-down links into the ledger.
                  </p>
                </div>

                <details className="analytics-filter-shell">
                  <summary className="analytics-filter-summary">
                    <span className="analytics-filter-summary-copy">
                      <span className="analytics-filter-summary-title">
                        Filter
                      </span>
                      <span className="analytics-filter-summary-detail">
                        Range, account, categories, and archived-wallet scope.
                      </span>
                    </span>
                    <span className="analytics-filter-summary-meta">
                      <span className="analytics-filter-summary-status">
                        {hasActiveFilters
                          ? `${activeFilterCount} active`
                          : "All data"}
                      </span>
                      <span
                        className="analytics-filter-summary-chevron"
                        aria-hidden="true"
                      />
                    </span>
                  </summary>

                  <form className="filter-grid is-relaxed lg:grid-cols-[repeat(5,minmax(0,1fr))_auto]">
                    <div className="app-form-field">
                      <label>From</label>
                      <input
                        type="month"
                        name="from"
                        defaultValue={filters.from}
                      />
                    </div>
                    <div className="app-form-field">
                      <label>To</label>
                      <input type="month" name="to" defaultValue={filters.to} />
                    </div>
                    <div className="app-form-field">
                      <label>Account</label>
                      <select name="accountId" defaultValue={filters.accountId}>
                        <option value="">All</option>
                        {accounts.map((account) => (
                          <option key={account.id} value={account.id}>
                            {account.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="app-form-field">
                      <label>Primary</label>
                      <select
                        name="primaryCategoryId"
                        defaultValue={filters.primaryCategoryId}
                      >
                        <option value="">All</option>
                        {visibleExpensePrimaries.map((category) => (
                          <option key={category.id} value={category.id}>
                            {category.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="app-form-field">
                      <label>Secondary</label>
                      <select
                        name="secondaryCategoryId"
                        defaultValue={filters.secondaryCategoryId}
                      >
                        <option value="">All</option>
                        {visibleSecondaryCategories.map((category) => (
                          <option key={category.id} value={category.id}>
                            {formatCategoryName(category)}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="section-stack-tight justify-end">
                      <label className="page-pill">
                        <input
                          type="checkbox"
                          name="includeArchivedAccounts"
                          value="true"
                          defaultChecked={filters.includeArchivedAccounts}
                        />
                        Include archived accounts
                      </label>
                      <div className="filter-actions is-equal">
                        <button type="submit" className="btn-primary">
                          Apply
                        </button>
                        <FilterResetButton
                          href="/analytics"
                          className="btn-secondary"
                        >
                          Clear
                        </FilterResetButton>
                      </div>
                    </div>
                  </form>
                </details>

                {hasPendingSync ? (
                  <div className="detail-panel is-roomy">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div>
                        <h2 className="text-sm font-semibold text-[var(--text-primary)]">
                          Recurring sync
                        </h2>
                        <p className="mt-1 text-sm text-[var(--text-secondary)]">
                          There are recurring transactions due that haven&apos;t
                          been added to the ledger yet. Sync to include them in
                          Analytics before trusting the month-level story.
                        </p>
                      </div>
                      <RecurringMaterializeButton />
                    </div>
                  </div>
                ) : null}
              </div>
            </section>

            {analytics.currencies.length === 0 ? (
              <section className="page-inline-notice surface-dashed">
                <p className="font-medium text-gray-700">
                  {!setup?.isComplete
                    ? "Analytics is available, but the trust baseline is still incomplete."
                    : "No analytics data matches the current range and filters."}
                </p>
                <p className="mt-2">
                  {!setup?.isComplete
                    ? "Finish setup or import existing data first so analytics has real accounts, categories, and history to work with."
                    : filters.from !== defaultFilters.from ||
                        filters.to !== defaultFilters.to ||
                        filters.accountId ||
                        filters.primaryCategoryId ||
                        filters.secondaryCategoryId ||
                        filters.includeArchivedAccounts
                      ? "The selected month range, account, category, or archived toggle may be filtering everything out. Widen the range or clear the filters."
                      : "There is no matching income or expense activity in this range yet. Import existing data or record your first month first."}
                </p>
                <div className="mt-4 flex flex-wrap gap-3">
                  <Link
                    href={!setup?.isComplete ? "/setup" : "/import"}
                    className="btn-secondary"
                  >
                    {!setup?.isComplete ? "Open setup" : "Open import"}
                  </Link>
                  <Link href="/analytics" className="btn-secondary">
                    Clear filters
                  </Link>
                  <Link
                    href={`/review?month=${encodeURIComponent(analytics.focusMonth)}`}
                    className="btn-secondary"
                  >
                    Open review
                  </Link>
                </div>
              </section>
            ) : (
              <>
                {analytics.currencies.map((currency) => {
                  return (
                    <div
                      key={currency.currency}
                      className="route-stack-desktop-xl"
                    >
                      <section className="page-section is-spacious section-stack-desktop-xl">
                        <div>
                          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-2">
                            <h2 className="text-2xl font-semibold text-gray-900">
                              {currency.currency}
                            </h2>
                            <p className="text-sm text-gray-500">
                              Range {analytics.from} to {analytics.to}
                            </p>
                          </div>
                          <div className="summary-grid is-loose mt-5 md:max-w-[520px] md:grid-cols-2">
                            <div className="summary-card text-sm">
                              <p className="summary-card-label">
                                Avg monthly income
                              </p>
                              <p className="summary-card-value">
                                <MoneyValue
                                  value={currency.averageMonthlyIncome}
                                  currency={currency.currency}
                                />
                              </p>
                            </div>
                            <div className="summary-card text-sm">
                              <p className="summary-card-label">
                                Avg monthly expense
                              </p>
                              <p className="summary-card-value">
                                <MoneyValue
                                  value={currency.averageMonthlyExpense}
                                  currency={currency.currency}
                                />
                              </p>
                            </div>
                          </div>
                        </div>

                        <div className="mt-6 rounded-2xl border border-[var(--border-glass)] bg-[var(--bg-card-muted)] p-4">
                          <AnalyticsTrendChart
                            data={currency.monthlySeries.map((month) => ({
                              ...month,
                              href: buildTransactionsLink({
                                month: month.month,
                                accountId: filters.accountId || undefined,
                                primaryCategoryId:
                                  filters.primaryCategoryId || undefined,
                                secondaryCategoryId:
                                  filters.secondaryCategoryId || undefined,
                                includeArchivedAccounts:
                                  filters.includeArchivedAccounts,
                              }),
                            }))}
                            currency={currency.currency}
                          />
                        </div>
                      </section>

                      <section className="page-section is-spacious analytics-section">
                        <div className="analytics-section-intro">
                          <h3 className="text-xl font-semibold text-gray-900">
                            Where did my money go this month
                          </h3>
                          <p className="text-sm text-gray-500">
                            Focus month {analytics.focusMonth}, with direct
                            links into the transaction ledger.
                          </p>
                        </div>

                        <div className="analytics-section-grid">
                          <div className="analytics-subsection">
                            <h4 className="analytics-subsection-title">
                              Expense breakdown
                            </h4>
                            {currency.focusMonthExpenseBreakdown.length > 0 ? (
                              <div className="detail-panel analytics-subsection-visual">
                                <AnalyticsCategoryBarChart
                                  currency={currency.currency}
                                  data={currency.focusMonthExpenseBreakdown.map(
                                    (item) => ({
                                      ...item,
                                      chartLabel:
                                        item.secondaryCategoryName ??
                                        formatHierarchyName(item, item.name),
                                      href: buildTransactionsLink({
                                        month: analytics.focusMonth,
                                        accountId:
                                          filters.accountId || undefined,
                                        primaryCategoryId:
                                          item.primaryCategoryId ?? undefined,
                                        secondaryCategoryId:
                                          item.secondaryCategoryId ??
                                          item.categoryId ??
                                          undefined,
                                        kind: "EXPENSE",
                                        includeArchivedAccounts:
                                          filters.includeArchivedAccounts,
                                      }),
                                    }),
                                  )}
                                  mode="breakdown"
                                  tone="expense"
                                />
                              </div>
                            ) : null}
                            {currency.focusMonthExpenseBreakdown.length ===
                            0 ? (
                              <p className="analytics-subsection-empty text-sm text-gray-500">
                                No expense categories in the focus month.
                              </p>
                            ) : null}
                          </div>

                          <div className="analytics-subsection">
                            <h4 className="analytics-subsection-title">
                              Income breakdown
                            </h4>
                            {currency.focusMonthIncomeBreakdown.length > 0 ? (
                              <div className="detail-panel analytics-subsection-visual">
                                <AnalyticsCategoryBarChart
                                  currency={currency.currency}
                                  data={currency.focusMonthIncomeBreakdown.map(
                                    (item) => ({
                                      ...item,
                                      chartLabel: formatHierarchyName(
                                        item,
                                        item.name,
                                      ),
                                      href: buildTransactionsLink({
                                        month: analytics.focusMonth,
                                        accountId:
                                          filters.accountId || undefined,
                                        categoryId:
                                          item.categoryId ?? undefined,
                                        kind: "INCOME",
                                        includeArchivedAccounts:
                                          filters.includeArchivedAccounts,
                                      }),
                                    }),
                                  )}
                                  mode="breakdown"
                                  tone="income"
                                />
                              </div>
                            ) : null}
                            {currency.focusMonthIncomeBreakdown.length === 0 ? (
                              <p className="analytics-subsection-empty text-sm text-gray-500">
                                No income categories in the focus month.
                              </p>
                            ) : null}
                          </div>
                        </div>
                      </section>

                      <section className="page-section is-spacious analytics-section">
                        <div className="analytics-section-intro">
                          <h3 className="text-xl font-semibold text-gray-900">
                            Biggest changes
                          </h3>
                          <p className="text-sm text-gray-500">
                            Focus month versus the immediately previous month in
                            the selected range.
                          </p>
                        </div>

                        <div className="analytics-section-grid">
                          <div className="analytics-subsection">
                            <h4 className="analytics-subsection-title">
                              Expense movers
                            </h4>
                            {currency.expenseMonthOverMonthChanges.length >
                            0 ? (
                              <div className="detail-panel analytics-subsection-visual">
                                <AnalyticsCategoryBarChart
                                  currency={currency.currency}
                                  data={currency.expenseMonthOverMonthChanges.map(
                                    (item) => ({
                                      ...item,
                                      absoluteDelta: Math.abs(item.delta),
                                      chartLabel:
                                        item.secondaryCategoryName ??
                                        formatHierarchyName(item, item.name),
                                      href: buildTransactionsLink({
                                        from: selectedRange.from,
                                        to: selectedRange.to,
                                        accountId:
                                          filters.accountId || undefined,
                                        primaryCategoryId:
                                          item.primaryCategoryId ?? undefined,
                                        secondaryCategoryId:
                                          item.secondaryCategoryId ??
                                          item.categoryId ??
                                          undefined,
                                        kind: "EXPENSE",
                                        includeArchivedAccounts:
                                          filters.includeArchivedAccounts,
                                      }),
                                    }),
                                  )}
                                  mode="movers"
                                />
                              </div>
                            ) : null}
                            {currency.expenseMonthOverMonthChanges.length ===
                            0 ? (
                              <p className="analytics-subsection-empty text-sm text-gray-500">
                                No previous month available for expense
                                comparison.
                              </p>
                            ) : null}
                          </div>

                          <div className="analytics-subsection">
                            <h4 className="analytics-subsection-title">
                              Income movers
                            </h4>
                            {currency.incomeMonthOverMonthChanges.length > 0 ? (
                              <div className="detail-panel analytics-subsection-visual">
                                <AnalyticsCategoryBarChart
                                  currency={currency.currency}
                                  data={currency.incomeMonthOverMonthChanges.map(
                                    (item) => ({
                                      ...item,
                                      absoluteDelta: Math.abs(item.delta),
                                      chartLabel: formatHierarchyName(
                                        item,
                                        item.name,
                                      ),
                                      href: buildTransactionsLink({
                                        from: selectedRange.from,
                                        to: selectedRange.to,
                                        accountId:
                                          filters.accountId || undefined,
                                        categoryId:
                                          item.categoryId ?? undefined,
                                        kind: "INCOME",
                                        includeArchivedAccounts:
                                          filters.includeArchivedAccounts,
                                      }),
                                    }),
                                  )}
                                  mode="movers"
                                />
                              </div>
                            ) : null}
                            {currency.incomeMonthOverMonthChanges.length ===
                            0 ? (
                              <p className="analytics-subsection-empty text-sm text-gray-500">
                                No previous month available for income
                                comparison.
                              </p>
                            ) : null}
                          </div>
                        </div>
                      </section>

                      <section className="page-section is-spacious analytics-section">
                        <div className="analytics-section-intro">
                          <h3 className="text-xl font-semibold text-gray-900">
                            Category trends
                          </h3>
                          <p className="text-sm text-gray-500">
                            Top {TREND_ROW_LIMIT} categories across the selected
                            range, with direction over the period.
                          </p>
                        </div>

                        <div className="analytics-section-grid">
                          {[
                            {
                              title: "Expense trends",
                              kind: "EXPENSE" as const,
                              items: currency.expenseCategoryTrends,
                              tone: "expense" as const,
                            },
                            {
                              title: "Income trends",
                              kind: "INCOME" as const,
                              items: currency.incomeCategoryTrends,
                              tone: "income" as const,
                            },
                          ].map((section) => {
                            const visibleItems = section.items.slice(
                              0,
                              TREND_ROW_LIMIT,
                            );

                            return (
                              <div
                                key={section.title}
                                className="analytics-subsection"
                              >
                                <h4 className="analytics-subsection-title">
                                  {section.title}
                                </h4>
                                {visibleItems.length === 0 ? (
                                  <p className="analytics-subsection-empty text-sm text-gray-500">
                                    No category trends in this range.
                                  </p>
                                ) : (
                                  <div className="analytics-subsection-content flex flex-col gap-3">
                                    {visibleItems.map((item) => {
                                      const label =
                                        section.kind === "EXPENSE"
                                          ? (item.secondaryCategoryName ??
                                            formatHierarchyName(
                                              item,
                                              item.name,
                                            ))
                                          : formatHierarchyName(
                                              item,
                                              item.name,
                                            );
                                      const delta = trendDelta(item.series);
                                      const href = buildTransactionsLink({
                                        from: selectedRange.from,
                                        to: selectedRange.to,
                                        accountId:
                                          filters.accountId || undefined,
                                        primaryCategoryId:
                                          section.kind === "EXPENSE"
                                            ? (item.primaryCategoryId ??
                                              undefined)
                                            : undefined,
                                        secondaryCategoryId:
                                          section.kind === "EXPENSE"
                                            ? (item.secondaryCategoryId ??
                                              item.categoryId ??
                                              undefined)
                                            : undefined,
                                        categoryId:
                                          section.kind === "INCOME"
                                            ? (item.categoryId ?? undefined)
                                            : undefined,
                                        kind: section.kind,
                                        includeArchivedAccounts:
                                          filters.includeArchivedAccounts,
                                      });

                                      return (
                                        <Link
                                          key={`${section.kind}:${item.categoryId ?? item.name}`}
                                          href={href}
                                          className="flex items-center gap-6 rounded-[22px] [corner-shape:superellipse(0.72)] border border-[var(--border-glass)] bg-[var(--bg-card-muted)] px-4 py-3 text-sm transition hover:bg-[var(--bg-card-hover)]"
                                        >
                                          <span
                                            className="min-w-0 flex-1 truncate font-medium text-gray-900"
                                            title={label}
                                          >
                                            {label}
                                          </span>
                                          <Sparkline
                                            points={item.series.map(
                                              (point) => ({
                                                value: point.total,
                                              }),
                                            )}
                                            tone={section.tone}
                                            width={96}
                                            height={28}
                                          />
                                          <span className="w-24 flex-shrink-0 text-right tabular-nums text-gray-700">
                                            {formatCurrency(
                                              item.total,
                                              currency.currency,
                                            )}
                                          </span>
                                          <span
                                            className={`w-16 flex-shrink-0 text-right text-xs font-medium tabular-nums ${
                                              delta
                                                ? deltaToneClass(
                                                    section.kind,
                                                    delta.kind === "from-zero"
                                                      ? "up"
                                                      : delta.direction,
                                                  )
                                                : "text-gray-400"
                                            }`}
                                          >
                                            {delta === null
                                              ? "—"
                                              : delta.kind === "from-zero"
                                                ? "↑ new"
                                                : delta.direction === "flat"
                                                  ? "→ 0%"
                                                  : `${delta.direction === "up" ? "↑" : "↓"} ${Math.abs(
                                                      Math.round(delta.value),
                                                    )}%`}
                                          </span>
                                        </Link>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </section>
                    </div>
                  );
                })}

                <WorkflowSection
                  title="Turn the focus month into action"
                  description={`Use ${analytics.focusMonth} as the bridge between trend analysis, monthly review, and budgets.`}
                  className="is-roomy"
                  cards={getWorkflowCards({
                    currentPage: "analytics",
                    month: analytics.focusMonth,
                    setup,
                  })}
                />
              </>
            )}
          </div>
        )}
      </Container>
    </>
  );
}
