import Link from "next/link";
import type {
  AccountResponse,
  CashflowAnalyticsResponse,
  CategoryResponse,
  SetupStatusResponse,
} from "@finhance/shared";
import Container from "@components/Container";
import Header from "@components/Header";
import WorkflowSection from "@components/WorkflowSection";
import { api } from "@lib/api";
import {
  buildAnalyticsQueryString,
  buildTransactionsLink,
  getAnalyticsFilters,
  getMonthDateRange,
} from "@lib/analytics";
import { formatCurrency } from "@lib/format";
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

  return (
    <>
      <Header />
      <Container>
        {!analytics || !accounts || !categories ? (
          <>
            <h1 className="text-3xl font-semibold text-gray-900">Analytics</h1>
            <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-6 text-amber-950">
              <p className="font-medium">
                The web app could not reach the API.
              </p>
              <p className="mt-2 text-sm text-amber-900/80">
                {errorMessage ?? "Start the API and refresh the page."}
              </p>
            </div>
          </>
        ) : (
          <div className="space-y-8">
            <section className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-gray-100">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h1 className="text-3xl font-semibold text-gray-900">
                    Analytics
                  </h1>
                  <p className="mt-1 text-sm text-gray-500">
                    Multi-month cashflow trends, biggest category changes, and
                    drill-down links into the ledger.
                  </p>
                </div>
                <div className="rounded-full bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700">
                  Focus month {analytics.focusMonth}
                </div>
              </div>

              <form className="mt-6 grid gap-4 lg:grid-cols-[repeat(4,minmax(0,1fr))_auto]">
                <div className="flex flex-col gap-1">
                  <label className="text-sm font-medium text-gray-600">
                    From
                  </label>
                  <input
                    className="rounded-lg border px-3 py-2"
                    type="month"
                    name="from"
                    defaultValue={filters.from}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-sm font-medium text-gray-600">
                    To
                  </label>
                  <input
                    className="rounded-lg border px-3 py-2"
                    type="month"
                    name="to"
                    defaultValue={filters.to}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-sm font-medium text-gray-600">
                    Account
                  </label>
                  <select
                    className="rounded-lg border px-3 py-2"
                    name="accountId"
                    defaultValue={filters.accountId}
                  >
                    <option value="">All accounts</option>
                    {accounts.map((account) => (
                      <option key={account.id} value={account.id}>
                        {account.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-sm font-medium text-gray-600">
                    Category
                  </label>
                  <select
                    className="rounded-lg border px-3 py-2"
                    name="categoryId"
                    defaultValue={filters.categoryId}
                  >
                    <option value="">All categories</option>
                    {categories.map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-col justify-end gap-3">
                  <label className="flex items-center gap-2 text-sm text-gray-600">
                    <input
                      type="checkbox"
                      name="includeArchivedAccounts"
                      value="true"
                      defaultChecked={filters.includeArchivedAccounts}
                    />
                    Include archived accounts
                  </label>
                  <div className="flex gap-3">
                    <button
                      type="submit"
                      className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
                    >
                      Apply
                    </button>
                    <Link
                      href="/analytics"
                      className="rounded-lg border px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                    >
                      Clear
                    </Link>
                  </div>
                </div>
              </form>
            </section>

            <WorkflowSection
              title="Turn the focus month into action"
              description={`Use ${analytics.focusMonth} as the bridge between trend analysis, monthly review, and budgets.`}
              cards={getWorkflowCards({
                currentPage: "analytics",
                month: analytics.focusMonth,
                setup,
              })}
            />

            {analytics.currencies.length === 0 ? (
              <section className="rounded-3xl border border-dashed border-gray-300 bg-white p-8 text-sm text-gray-500">
                <p className="font-medium text-gray-700">
                  No analytics data matches the current range and filters.
                </p>
                <p className="mt-2">
                  The selected month range, account, category, or archived
                  toggle may be filtering everything out. Try widening the range
                  or use the existing Clear action above to reset the filters.
                </p>
              </section>
            ) : (
              analytics.currencies.map((currency) => {
                const seriesMax = maxSeriesValue(currency.monthlySeries);

                return (
                  <div key={currency.currency} className="space-y-8">
                    <section className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-gray-100">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <h2 className="text-2xl font-semibold text-gray-900">
                            {currency.currency}
                          </h2>
                          <p className="mt-1 text-sm text-gray-500">
                            Range {analytics.from} to {analytics.to}
                          </p>
                        </div>
                        <div className="grid gap-3 sm:grid-cols-2">
                          <div className="rounded-2xl bg-gray-50 px-4 py-3 text-sm">
                            <p className="text-xs uppercase tracking-wide text-gray-500">
                              Avg monthly income
                            </p>
                            <p className="mt-1 font-semibold text-gray-900">
                              {formatCurrency(
                                currency.averageMonthlyIncome,
                                currency.currency,
                              )}
                            </p>
                          </div>
                          <div className="rounded-2xl bg-gray-50 px-4 py-3 text-sm">
                            <p className="text-xs uppercase tracking-wide text-gray-500">
                              Avg monthly expense
                            </p>
                            <p className="mt-1 font-semibold text-gray-900">
                              {formatCurrency(
                                currency.averageMonthlyExpense,
                                currency.currency,
                              )}
                            </p>
                          </div>
                        </div>
                      </div>
                    </section>

                    <section className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-gray-100">
                      <h3 className="text-xl font-semibold text-gray-900">
                        Trend
                      </h3>
                      <p className="mt-1 text-sm text-gray-500">
                        Income, expense, adjustments, and net cashflow by month.
                      </p>

                      <div className="mt-5 grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
                        {currency.monthlySeries.map((month) => (
                          <Link
                            key={month.month}
                            href={buildTransactionsLink({
                              month: month.month,
                              accountId: filters.accountId || undefined,
                              categoryId: filters.categoryId || undefined,
                              includeArchivedAccounts:
                                filters.includeArchivedAccounts,
                            })}
                            className="rounded-2xl bg-gray-50 p-4 transition hover:bg-gray-100"
                          >
                            <div className="flex items-center justify-between gap-3">
                              <p className="font-semibold text-gray-900">
                                {month.month}
                              </p>
                              <span className="text-sm font-medium text-gray-700">
                                {formatCurrency(
                                  month.netCashflow,
                                  currency.currency,
                                )}
                              </span>
                            </div>

                            <div className="mt-4 space-y-3">
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

                    <section className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-gray-100">
                      <h3 className="text-xl font-semibold text-gray-900">
                        Where did my money go this month
                      </h3>
                      <p className="mt-1 text-sm text-gray-500">
                        Focus month {analytics.focusMonth}, with direct links
                        into the transaction ledger.
                      </p>

                      <div className="mt-5 grid gap-6 lg:grid-cols-2">
                        <div>
                          <h4 className="text-sm font-semibold text-gray-900">
                            Expense breakdown
                          </h4>
                          {currency.focusMonthExpenseBreakdown.length === 0 ? (
                            <p className="mt-2 text-sm text-gray-500">
                              No expense categories in the focus month.
                            </p>
                          ) : (
                            <div className="mt-2 space-y-2">
                              {currency.focusMonthExpenseBreakdown.map(
                                (item) => (
                                  <Link
                                    key={`expense:${item.categoryId ?? item.name}`}
                                    href={buildTransactionsLink({
                                      month: analytics.focusMonth,
                                      accountId: filters.accountId || undefined,
                                      categoryId: item.categoryId ?? undefined,
                                      kind: "EXPENSE",
                                      includeArchivedAccounts:
                                        filters.includeArchivedAccounts,
                                    })}
                                    className="flex items-center justify-between rounded-2xl bg-gray-50 px-4 py-3 text-sm transition hover:bg-gray-100"
                                  >
                                    <span className="font-medium text-gray-900">
                                      {item.name}
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

                        <div>
                          <h4 className="text-sm font-semibold text-gray-900">
                            Income breakdown
                          </h4>
                          {currency.focusMonthIncomeBreakdown.length === 0 ? (
                            <p className="mt-2 text-sm text-gray-500">
                              No income categories in the focus month.
                            </p>
                          ) : (
                            <div className="mt-2 space-y-2">
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
                                    className="flex items-center justify-between rounded-2xl bg-gray-50 px-4 py-3 text-sm transition hover:bg-gray-100"
                                  >
                                    <span className="font-medium text-gray-900">
                                      {item.name}
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

                    <section className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-gray-100">
                      <h3 className="text-xl font-semibold text-gray-900">
                        Biggest changes
                      </h3>
                      <p className="mt-1 text-sm text-gray-500">
                        Focus month versus the immediately previous month in the
                        selected range.
                      </p>

                      <div className="mt-5 grid gap-6 lg:grid-cols-2">
                        <div>
                          <h4 className="text-sm font-semibold text-gray-900">
                            Expense movers
                          </h4>
                          {currency.expenseMonthOverMonthChanges.length ===
                          0 ? (
                            <p className="mt-2 text-sm text-gray-500">
                              No previous month available for expense
                              comparison.
                            </p>
                          ) : (
                            <div className="mt-2 space-y-2">
                              {currency.expenseMonthOverMonthChanges.map(
                                (item) => (
                                  <Link
                                    key={`expense-change:${item.categoryId ?? item.name}`}
                                    href={buildTransactionsLink({
                                      from: selectedRange.from,
                                      to: selectedRange.to,
                                      accountId: filters.accountId || undefined,
                                      categoryId: item.categoryId ?? undefined,
                                      kind: "EXPENSE",
                                      includeArchivedAccounts:
                                        filters.includeArchivedAccounts,
                                    })}
                                    className="block rounded-2xl bg-gray-50 px-4 py-3 text-sm transition hover:bg-gray-100"
                                  >
                                    <div className="flex items-center justify-between gap-3">
                                      <span className="font-medium text-gray-900">
                                        {item.name}
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
                                ),
                              )}
                            </div>
                          )}
                        </div>

                        <div>
                          <h4 className="text-sm font-semibold text-gray-900">
                            Income movers
                          </h4>
                          {currency.incomeMonthOverMonthChanges.length === 0 ? (
                            <p className="mt-2 text-sm text-gray-500">
                              No previous month available for income comparison.
                            </p>
                          ) : (
                            <div className="mt-2 space-y-2">
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
                                    className="block rounded-2xl bg-gray-50 px-4 py-3 text-sm transition hover:bg-gray-100"
                                  >
                                    <div className="flex items-center justify-between gap-3">
                                      <span className="font-medium text-gray-900">
                                        {item.name}
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

                    <section className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-gray-100">
                      <h3 className="text-xl font-semibold text-gray-900">
                        Category trends
                      </h3>
                      <p className="mt-1 text-sm text-gray-500">
                        Top categories across the selected range.
                      </p>

                      <div className="mt-5 grid gap-6 lg:grid-cols-2">
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
                          <div key={section.title}>
                            <h4 className="text-sm font-semibold text-gray-900">
                              {section.title}
                            </h4>
                            {section.items.length === 0 ? (
                              <p className="mt-2 text-sm text-gray-500">
                                No category trends in this range.
                              </p>
                            ) : (
                              <div className="mt-2 space-y-3">
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
                                        categoryId:
                                          item.categoryId ?? undefined,
                                        kind: section.kind,
                                        includeArchivedAccounts:
                                          filters.includeArchivedAccounts,
                                      })}
                                      className="block rounded-2xl bg-gray-50 px-4 py-3 text-sm transition hover:bg-gray-100"
                                    >
                                      <div className="flex items-center justify-between gap-3">
                                        <span className="font-medium text-gray-900">
                                          {item.name}
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
                                            className="rounded-xl bg-white px-3 py-2"
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
