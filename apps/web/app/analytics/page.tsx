import Link from "next/link";
import type {
  AccountResponse,
  CashflowAnalyticsResponse,
  CategoryResponse,
  SetupStatusResponse,
} from "@finhance/shared";
import AnalyticsCategoryBarChart from "@components/AnalyticsCategoryBarChart";
import AnalyticsTrendChart from "@components/AnalyticsTrendChart";
import Container from "@components/Container";
import MoneyValue from "@components/MoneyValue";

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
  groupRowsByPrimary,
  incomeCategories,
} from "@lib/hierarchical-categories";
import { getWorkflowCards } from "@lib/workflow";

export const dynamic = "force-dynamic";

type RawSearchParams = Promise<Record<string, string | string[] | undefined>>;

function maxSeriesValue(
  items: CashflowAnalyticsResponse["currencies"][number]["monthlySeries"],
): number {
  return Math.max(
    1,
    ...items.flatMap((month) => [
      month.incomeTotal,
      month.expenseTotal,
      Math.abs(month.netCashflow),
    ]),
  );
}

function maxTrendValue(
  item: CashflowAnalyticsResponse["currencies"][number]["expenseCategoryTrends"][number],
): number {
  return Math.max(1, ...item.series.map((point) => point.total));
}

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
    try {
      setup = await api<SetupStatusResponse>(
        "/setup/status?includeWarnings=false",
      );
    } catch {
      setup = null;
    }
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
                <div className="page-hero-row">
                  <div className="page-hero-copy">
                    <p className="page-kicker">Analysis</p>
                    <h1 className="page-title is-compact">Analytics</h1>
                    <p className="page-description">
                      Multi-month cashflow trends, biggest category changes, and
                      drill-down links into the ledger.
                    </p>
                  </div>
                  <div className="page-pill">
                    Focus month {analytics.focusMonth}
                  </div>
                </div>

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
                      <option value="">All accounts</option>
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
                      <option value="">All primaries</option>
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
                      <option value="">All secondaries</option>
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
                      <Link href="/analytics" className="btn-secondary">
                        Clear
                      </Link>
                    </div>
                  </div>
                </form>
              </div>
            </section>

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
              analytics.currencies.map((currency) => {
                const seriesMax = maxSeriesValue(currency.monthlySeries);

                return (
                  <div
                    key={currency.currency}
                    className="route-stack-desktop-xl"
                  >
                    <section className="page-section is-spacious section-stack-desktop-xl">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <h2 className="text-2xl font-semibold text-gray-900">
                            {currency.currency}
                          </h2>
                          <p className="mt-1 text-sm text-gray-500">
                            Range {analytics.from} to {analytics.to}
                          </p>
                        </div>
                        <div className="summary-grid is-loose sm:grid-cols-2">
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
                          data={currency.monthlySeries}
                          currency={currency.currency}
                        />
                      </div>
                    </section>

                    <section className="page-section is-spacious section-stack-desktop-xl">
                      <h3 className="text-xl font-semibold text-gray-900">
                        Trend
                      </h3>
                      <p className="mt-1 text-sm text-gray-500">
                        Income, expense, adjustments, and net cashflow by month.
                      </p>

                      <div className="mt-5 grid gap-6 lg:grid-cols-2">
                        {currency.monthlySeries.map((month) => (
                          <Link
                            key={month.month}
                            href={buildTransactionsLink({
                              month: month.month,
                              accountId: filters.accountId || undefined,
                              primaryCategoryId:
                                filters.primaryCategoryId || undefined,
                              secondaryCategoryId:
                                filters.secondaryCategoryId || undefined,
                              includeArchivedAccounts:
                                filters.includeArchivedAccounts,
                            })}
                            className="list-card is-muted is-roomy transition hover:bg-[var(--bg-card-hover)]"
                          >
                            <div className="flex items-center justify-between gap-3">
                              <p className="font-semibold text-gray-900">
                                {month.month}
                              </p>
                              <span className="text-sm font-medium text-gray-700">
                                <MoneyValue
                                  value={month.netCashflow}
                                  currency={currency.currency}
                                />
                              </span>
                            </div>

                            <div className="mt-4 subcard-stack-spacious">
                              {[
                                {
                                  label: "Income",
                                  value: month.incomeTotal,
                                  color: "bg-emerald-500",
                                },
                                {
                                  label: "Expense",
                                  value: month.expenseTotal,
                                  color: "bg-rose-500",
                                },
                                {
                                  label: "Net",
                                  value: Math.abs(month.netCashflow),
                                  color: "bg-sky-500",
                                  display: formatCurrency(
                                    month.netCashflow,
                                    currency.currency,
                                  ),
                                },
                              ].map((item) => (
                                <div key={`${month.month}:${item.label}`}>
                                  <div className="flex items-center justify-between gap-3 text-xs text-gray-600">
                                    <span>{item.label}</span>
                                    <span>
                                      {item.display ??
                                        formatCurrency(
                                          item.value,
                                          currency.currency,
                                        )}
                                    </span>
                                  </div>
                                  <div className="mt-1 h-2 rounded-full bg-white">
                                    <div
                                      className={`h-2 rounded-full ${item.color}`}
                                      style={{
                                        width: `${Math.min(
                                          100,
                                          (item.value / seriesMax) * 100,
                                        )}%`,
                                      }}
                                    />
                                  </div>
                                </div>
                              ))}
                            </div>

                            <div className="mt-4 flex flex-wrap gap-3 text-xs text-gray-500">
                              <span>
                                Adj in{" "}
                                {formatCurrency(
                                  month.adjustmentInTotal,
                                  currency.currency,
                                )}
                              </span>
                              <span>
                                Adj out{" "}
                                {formatCurrency(
                                  month.adjustmentOutTotal,
                                  currency.currency,
                                )}
                              </span>
                            </div>
                          </Link>
                        ))}
                      </div>
                    </section>

                    <section className="page-section is-spacious analytics-section">
                      <div className="analytics-section-intro">
                        <h3 className="text-xl font-semibold text-gray-900">
                          Where did my money go this month
                        </h3>
                        <p className="text-sm text-gray-500">
                          Focus month {analytics.focusMonth}, with direct links
                          into the transaction ledger.
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
                                data={currency.focusMonthExpenseBreakdown}
                                mode="breakdown"
                              />
                            </div>
                          ) : null}
                          {currency.focusMonthExpenseBreakdown.length === 0 ? (
                            <p className="analytics-subsection-empty text-sm text-gray-500">
                              No expense categories in the focus month.
                            </p>
                          ) : (
                            <div className="analytics-subsection-content section-stack-tight">
                              {groupRowsByPrimary(
                                currency.focusMonthExpenseBreakdown,
                                (item) => item.name,
                              ).map((group) => (
                                <div
                                  key={group.key}
                                  className="section-stack-tight"
                                >
                                  <h5 className="px-1 text-xs font-semibold uppercase tracking-[0.22em] text-gray-500">
                                    {group.label}
                                  </h5>
                                  <div className="subcard-stack is-loose">
                                    {group.items.map((item) => (
                                      <Link
                                        key={`expense:${item.categoryId ?? item.name}`}
                                        href={buildTransactionsLink({
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
                                        })}
                                        className="detail-panel is-roomy flex items-center justify-between gap-4 text-sm transition hover:bg-[var(--bg-card-hover)]"
                                      >
                                        <span className="font-medium text-gray-900">
                                          {item.secondaryCategoryName ??
                                            formatHierarchyName(
                                              item,
                                              item.name,
                                            )}
                                        </span>
                                        <span className="text-gray-700">
                                          {formatCurrency(
                                            item.total,
                                            currency.currency,
                                          )}
                                        </span>
                                      </Link>
                                    ))}
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

                        <div className="analytics-subsection">
                          <h4 className="analytics-subsection-title">
                            Income breakdown
                          </h4>
                          {currency.focusMonthIncomeBreakdown.length === 0 ? (
                            <p className="analytics-subsection-empty text-sm text-gray-500">
                              No income categories in the focus month.
                            </p>
                          ) : (
                            <div className="analytics-subsection-content subcard-stack is-loose">
                              {currency.focusMonthIncomeBreakdown.map(
                                (item) => (
                                  <Link
                                    key={`income:${item.categoryId ?? item.name}`}
                                    href={buildTransactionsLink({
                                      month: analytics.focusMonth,
                                      accountId: filters.accountId || undefined,
                                      categoryId: item.categoryId ?? undefined,
                                      kind: "INCOME",
                                      includeArchivedAccounts:
                                        filters.includeArchivedAccounts,
                                    })}
                                    className="detail-panel is-roomy flex items-center justify-between gap-4 text-sm transition hover:bg-[var(--bg-card-hover)]"
                                  >
                                    <span className="font-medium text-gray-900">
                                      {formatHierarchyName(item, item.name)}
                                    </span>
                                    <span className="text-gray-700">
                                      {formatCurrency(
                                        item.total,
                                        currency.currency,
                                      )}
                                    </span>
                                  </Link>
                                ),
                              )}
                            </div>
                          )}
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
                          {currency.expenseMonthOverMonthChanges.length > 0 ? (
                            <div className="detail-panel analytics-subsection-visual">
                              <AnalyticsCategoryBarChart
                                currency={currency.currency}
                                data={currency.expenseMonthOverMonthChanges.map(
                                  (item) => ({
                                    ...item,
                                    absoluteDelta: Math.abs(item.delta),
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
                          ) : (
                            <div className="analytics-subsection-content section-stack-tight">
                              {groupRowsByPrimary(
                                currency.expenseMonthOverMonthChanges,
                                (item) => item.name,
                              ).map((group) => (
                                <div
                                  key={group.key}
                                  className="section-stack-tight"
                                >
                                  <h5 className="px-1 text-xs font-semibold uppercase tracking-[0.22em] text-gray-500">
                                    {group.label}
                                  </h5>
                                  <div className="subcard-stack is-loose">
                                    {group.items.map((item) => (
                                      <Link
                                        key={`expense-change:${item.categoryId ?? item.name}`}
                                        href={buildTransactionsLink({
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
                                        })}
                                        className="detail-panel is-roomy block text-sm transition hover:bg-[var(--bg-card-hover)]"
                                      >
                                        <div className="flex items-center justify-between gap-3">
                                          <span className="font-medium text-gray-900">
                                            {item.secondaryCategoryName ??
                                              formatHierarchyName(
                                                item,
                                                item.name,
                                              )}
                                          </span>
                                          <span
                                            className={
                                              item.delta >= 0
                                                ? "font-medium text-rose-700"
                                                : "font-medium text-emerald-700"
                                            }
                                          >
                                            {item.delta >= 0 ? "+" : ""}
                                            {formatCurrency(
                                              item.delta,
                                              currency.currency,
                                            )}
                                          </span>
                                        </div>
                                        <p className="mt-1 text-gray-500">
                                          Prev{" "}
                                          {formatCurrency(
                                            item.previousTotal,
                                            currency.currency,
                                          )}{" "}
                                          · Now{" "}
                                          {formatCurrency(
                                            item.currentTotal,
                                            currency.currency,
                                          )}
                                        </p>
                                      </Link>
                                    ))}
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

                        <div className="analytics-subsection">
                          <h4 className="analytics-subsection-title">
                            Income movers
                          </h4>
                          {currency.incomeMonthOverMonthChanges.length === 0 ? (
                            <p className="analytics-subsection-empty text-sm text-gray-500">
                              No previous month available for income comparison.
                            </p>
                          ) : (
                            <div className="analytics-subsection-content subcard-stack is-loose">
                              {currency.incomeMonthOverMonthChanges.map(
                                (item) => (
                                  <Link
                                    key={`income-change:${item.categoryId ?? item.name}`}
                                    href={buildTransactionsLink({
                                      from: selectedRange.from,
                                      to: selectedRange.to,
                                      accountId: filters.accountId || undefined,
                                      categoryId: item.categoryId ?? undefined,
                                      kind: "INCOME",
                                      includeArchivedAccounts:
                                        filters.includeArchivedAccounts,
                                    })}
                                    className="detail-panel is-roomy block text-sm transition hover:bg-[var(--bg-card-hover)]"
                                  >
                                    <div className="flex items-center justify-between gap-3">
                                      <span className="font-medium text-gray-900">
                                        {formatHierarchyName(item, item.name)}
                                      </span>
                                      <span
                                        className={
                                          item.delta >= 0
                                            ? "font-medium text-emerald-700"
                                            : "font-medium text-rose-700"
                                        }
                                      >
                                        {item.delta >= 0 ? "+" : ""}
                                        {formatCurrency(
                                          item.delta,
                                          currency.currency,
                                        )}
                                      </span>
                                    </div>
                                    <p className="mt-1 text-gray-500">
                                      Prev{" "}
                                      {formatCurrency(
                                        item.previousTotal,
                                        currency.currency,
                                      )}{" "}
                                      · Now{" "}
                                      {formatCurrency(
                                        item.currentTotal,
                                        currency.currency,
                                      )}
                                    </p>
                                  </Link>
                                ),
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </section>

                    <section className="page-section is-spacious analytics-section">
                      <div className="analytics-section-intro">
                        <h3 className="text-xl font-semibold text-gray-900">
                          Category trends
                        </h3>
                        <p className="text-sm text-gray-500">
                          Top categories across the selected range.
                        </p>
                      </div>

                      <div className="analytics-section-grid">
                        {[
                          {
                            title: "Expense trends",
                            kind: "EXPENSE",
                            items: currency.expenseCategoryTrends,
                          },
                          {
                            title: "Income trends",
                            kind: "INCOME",
                            items: currency.incomeCategoryTrends,
                          },
                        ].map((section) => (
                          <div
                            key={section.title}
                            className="analytics-subsection"
                          >
                            <h4 className="analytics-subsection-title">
                              {section.title}
                            </h4>
                            {section.items.length === 0 ? (
                              <p className="analytics-subsection-empty text-sm text-gray-500">
                                No category trends in this range.
                              </p>
                            ) : section.kind === "EXPENSE" ? (
                              <div className="analytics-subsection-content section-stack-tight">
                                {groupRowsByPrimary(
                                  section.items,
                                  (item) => item.name,
                                ).map((group) => (
                                  <div
                                    key={group.key}
                                    className="section-stack-tight"
                                  >
                                    <h5 className="px-1 text-xs font-semibold uppercase tracking-[0.22em] text-gray-500">
                                      {group.label}
                                    </h5>
                                    <div className="subcard-stack is-loose">
                                      {group.items.map((item) => {
                                        const trendMax = maxTrendValue(item);

                                        return (
                                          <Link
                                            key={`${section.kind}:${item.categoryId ?? item.name}`}
                                            href={buildTransactionsLink({
                                              from: selectedRange.from,
                                              to: selectedRange.to,
                                              accountId:
                                                filters.accountId || undefined,
                                              primaryCategoryId:
                                                item.primaryCategoryId ??
                                                undefined,
                                              secondaryCategoryId:
                                                item.secondaryCategoryId ??
                                                item.categoryId ??
                                                undefined,
                                              kind: section.kind,
                                              includeArchivedAccounts:
                                                filters.includeArchivedAccounts,
                                            })}
                                            className="detail-panel is-roomy block text-sm transition hover:bg-[var(--bg-card-hover)]"
                                          >
                                            <div className="flex items-center justify-between gap-3">
                                              <span className="font-medium text-gray-900">
                                                {item.secondaryCategoryName ??
                                                  formatHierarchyName(
                                                    item,
                                                    item.name,
                                                  )}
                                              </span>
                                              <span className="text-gray-700">
                                                {formatCurrency(
                                                  item.total,
                                                  currency.currency,
                                                )}
                                              </span>
                                            </div>
                                            <div className="mt-3 grid grid-cols-2 gap-2 xl:grid-cols-3">
                                              {item.series.map((point) => (
                                                <div
                                                  key={`${item.name}:${point.month}`}
                                                  className="detail-panel is-roomy"
                                                >
                                                  <div className="flex items-center justify-between gap-2 text-xs text-gray-500">
                                                    <span>{point.month}</span>
                                                    <span>
                                                      {formatCurrency(
                                                        point.total,
                                                        currency.currency,
                                                      )}
                                                    </span>
                                                  </div>
                                                  <div className="mt-2 h-2 rounded-full bg-gray-100">
                                                    <div
                                                      className="h-2 rounded-full bg-rose-500"
                                                      style={{
                                                        width: `${Math.min(
                                                          100,
                                                          (point.total /
                                                            trendMax) *
                                                            100,
                                                        )}%`,
                                                      }}
                                                    />
                                                  </div>
                                                </div>
                                              ))}
                                            </div>
                                          </Link>
                                        );
                                      })}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <div className="analytics-subsection-content subcard-stack is-loose">
                                {section.items.map((item) => {
                                  const trendMax = maxTrendValue(item);

                                  return (
                                    <Link
                                      key={`${section.kind}:${item.categoryId ?? item.name}`}
                                      href={buildTransactionsLink({
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
                                      })}
                                      className="detail-panel is-roomy block text-sm transition hover:bg-[var(--bg-card-hover)]"
                                    >
                                      <div className="flex items-center justify-between gap-3">
                                        <span className="font-medium text-gray-900">
                                          {formatHierarchyName(item, item.name)}
                                        </span>
                                        <span className="text-gray-700">
                                          {formatCurrency(
                                            item.total,
                                            currency.currency,
                                          )}
                                        </span>
                                      </div>
                                      <div className="mt-3 grid grid-cols-2 gap-2 xl:grid-cols-3">
                                        {item.series.map((point) => (
                                          <div
                                            key={`${item.name}:${point.month}`}
                                            className="detail-panel is-roomy"
                                          >
                                            <div className="flex items-center justify-between gap-2 text-xs text-gray-500">
                                              <span>{point.month}</span>
                                              <span>
                                                {formatCurrency(
                                                  point.total,
                                                  currency.currency,
                                                )}
                                              </span>
                                            </div>
                                            <div className="mt-2 h-2 rounded-full bg-gray-100">
                                              <div
                                                className={`h-2 rounded-full ${
                                                  section.kind === "EXPENSE"
                                                    ? "bg-rose-500"
                                                    : "bg-emerald-500"
                                                }`}
                                                style={{
                                                  width: `${Math.min(
                                                    100,
                                                    (point.total / trendMax) *
                                                      100,
                                                  )}%`,
                                                }}
                                              />
                                            </div>
                                          </div>
                                        ))}
                                      </div>
                                    </Link>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </section>
                  </div>
                );
              })
            )}
          </div>
        )}
      </Container>
    </>
  );
}
