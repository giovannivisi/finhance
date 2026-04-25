import Link from "next/link";
import Container from "@components/Container";
import Header from "@components/Header";
import type {
  DashboardAssetResponse,
  DashboardResponse,
  MonthlyBudgetResponse,
  SetupStatusResponse,
} from "@finhance/shared";
import { api } from "@lib/api";
import DashboardClient from "@components/DashboardClient";
import { getCurrentRomeMonth } from "@lib/budgets";
import { formatCurrency } from "@lib/format";
import { getPrimarySetupAction, getSetupProgressLabel } from "@lib/setup";

export const dynamic = "force-dynamic";

export default async function Home() {
  let dashboard: DashboardResponse | null = null;
  let budgetView: MonthlyBudgetResponse | null = null;
  let setup: SetupStatusResponse | null = null;
  let errorMessage: string | null = null;

  try {
    [dashboard, budgetView] = await Promise.all([
      api<DashboardResponse>("/dashboard"),
      api<MonthlyBudgetResponse>(
        `/budgets?month=${encodeURIComponent(getCurrentRomeMonth())}`,
      ),
    ]);
  } catch (error) {
    errorMessage =
      error instanceof Error
        ? error.message
        : "Dashboard data is currently unavailable.";
  }

  if (dashboard) {
    try {
      setup = await api<SetupStatusResponse>("/setup/status");
    } catch {
      setup = null;
    }
  }

  if (!dashboard) {
    return (
      <>
        <Header />
        <Container>
          <h2 className="text-2xl font-semibold">Dashboard unavailable</h2>
          <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-6 text-amber-950">
            <p className="font-medium">The web app could not reach the API.</p>
            <p className="mt-2 text-sm text-amber-900/80">
              {errorMessage ?? "Start the API and refresh the page."}
            </p>
          </div>
        </Container>
      </>
    );
  }

  const assets = dashboard.assets;
  const assetList = assets.filter((asset) => asset.type === "ASSET");
  const grouped: Record<string, DashboardAssetResponse[]> = assets.reduce(
    (acc, asset) => {
      const groupKey =
        asset.type === "ASSET"
          ? asset.kind || "Unassigned"
          : asset.liabilityKind || "Unassigned";
      if (!acc[groupKey]) acc[groupKey] = [];
      acc[groupKey].push(asset);
      return acc;
    },
    {} as Record<string, DashboardAssetResponse[]>,
  );

  const kindTotals = assetList.reduce(
    (acc, asset) => {
      const value = asset.currentValue ?? asset.referenceValue ?? null;

      if (value !== null) {
        const kind = asset.kind ?? "Unassigned";
        acc[kind] = (acc[kind] || 0) + value;
      }
      return acc;
    },
    {} as Record<string, number>,
  );

  const kindTotalsArray = Object.entries(kindTotals)
    .map(([kind, total]) => ({
      kind,
      total,
    }))
    .sort((left, right) => right.total - left.total);

  return (
    <>
      <Header />
      <Container>
        <h2 className="text-2xl font-semibold">Summary</h2>

        {setup && !setup.isComplete ? (
          <section className="mb-6 rounded-3xl border border-blue-200 bg-blue-50 p-6 text-blue-950">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-sm font-medium uppercase tracking-wide text-blue-700">
                  Setup checklist
                </p>
                <h3 className="mt-2 text-2xl font-semibold">
                  Your trust baseline is not complete yet
                </h3>
                <p className="mt-2 text-sm text-blue-900/80">
                  {getSetupProgressLabel(setup)}. Finish the baseline first,
                  then move into review, analytics, budgets, and recurring
                  workflows with fewer surprises.
                </p>
              </div>
              <Link
                href="/setup"
                className="rounded-lg border border-blue-300 px-4 py-2 text-sm font-medium text-blue-900 hover:bg-blue-100"
              >
                Open setup
              </Link>
            </div>

            {(() => {
              const primaryAction = getPrimarySetupAction(setup);

              if (!primaryAction) {
                return null;
              }

              return (
                <div className="mt-5 rounded-2xl bg-white/70 p-4">
                  <p className="text-sm font-medium text-blue-700">
                    Best next action
                  </p>
                  <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="font-semibold text-gray-900">
                        {primaryAction.title}
                      </p>
                      <p className="mt-1 text-sm text-gray-600">
                        {primaryAction.detail}
                      </p>
                    </div>
                    <Link
                      href={primaryAction.href}
                      className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
                    >
                      {primaryAction.actionLabel}
                    </Link>
                  </div>
                </div>
              );
            })()}
          </section>
        ) : null}

        <div className="grid grid-cols-3 gap-4">
          <div className="bg-white shadow rounded-2xl p-4 text-center">
            <p className="text-sm text-gray-500">Assets</p>
            <p className="text-green-600 text-xl font-bold">
              {formatCurrency(dashboard.summary.assets, dashboard.baseCurrency)}
            </p>
          </div>
          <div className="bg-white shadow rounded-2xl p-4 text-center">
            <p className="text-sm text-gray-500">Liabilities</p>
            <p className="text-red-600 text-xl font-bold">
              {formatCurrency(
                dashboard.summary.liabilities,
                dashboard.baseCurrency,
              )}
            </p>
          </div>
          <div className="bg-white shadow rounded-2xl p-4 text-center">
            <p className="text-sm text-gray-500">Net Worth</p>
            <p className="text-black text-xl font-bold">
              {formatCurrency(
                dashboard.summary.netWorth,
                dashboard.baseCurrency,
              )}
            </p>
          </div>
        </div>

        <DashboardClient
          grouped={grouped}
          kindTotalsArray={kindTotalsArray}
          baseCurrency={dashboard.baseCurrency}
          lastRefreshAt={dashboard.lastRefreshAt}
        />

        {budgetView ? (
          <section className="mt-10 rounded-3xl bg-white p-6 shadow-sm ring-1 ring-gray-100">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-2xl font-semibold text-gray-900">
                  Budgets
                </h3>
                <p className="mt-1 text-sm text-gray-500">
                  Current-month budget coverage and the categories already
                  breaking plan.
                </p>
              </div>
              <Link
                href={`/budgets?month=${encodeURIComponent(budgetView.month)}`}
                className="text-sm font-medium text-blue-600 hover:underline"
              >
                Open budgets
              </Link>
            </div>

            {budgetView.currencies.length === 0 ? (
              <div className="mt-5 rounded-2xl border border-dashed border-gray-300 bg-gray-50 p-5 text-sm text-gray-500">
                No budgets or expense activity for {budgetView.month}.
              </div>
            ) : (
              <div className="mt-5 grid gap-4 lg:grid-cols-2">
                {budgetView.currencies.map((currency) => (
                  <div
                    key={currency.currency}
                    className="rounded-2xl border border-gray-200 p-4"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <h4 className="text-lg font-semibold text-gray-900">
                        {currency.currency}
                      </h4>
                      <span className="text-sm text-gray-500">
                        {currency.budgetedCategoryCount} budgeted
                      </span>
                    </div>

                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      <div className="rounded-2xl bg-gray-50 px-4 py-3 text-sm">
                        <p className="text-xs uppercase tracking-wide text-gray-500">
                          Spent vs budget
                        </p>
                        <p className="mt-1 font-semibold text-gray-900">
                          {formatCurrency(
                            currency.spentTotal,
                            currency.currency,
                          )}{" "}
                          /{" "}
                          {formatCurrency(
                            currency.budgetTotal,
                            currency.currency,
                          )}
                        </p>
                      </div>
                      <div className="rounded-2xl bg-gray-50 px-4 py-3 text-sm">
                        <p className="text-xs uppercase tracking-wide text-gray-500">
                          Remaining
                        </p>
                        <p className="mt-1 font-semibold text-gray-900">
                          {formatCurrency(
                            currency.remainingTotal,
                            currency.currency,
                          )}
                        </p>
                      </div>
                    </div>

                    {currency.overBudgetHighlights.length > 0 ? (
                      <div className="mt-4 space-y-2">
                        <p className="text-sm font-medium text-gray-700">
                          Top over-budget categories
                        </p>
                        {currency.overBudgetHighlights.map((item) => (
                          <div
                            key={item.budgetId}
                            className="flex items-center justify-between gap-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-900"
                          >
                            <span>{item.categoryName}</span>
                            <span className="font-medium">
                              {formatCurrency(
                                item.spentAmount - item.budgetAmount,
                                item.currency,
                              )}
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="mt-4 text-sm text-emerald-700">
                        No categories are over budget in {currency.currency}.
                      </p>
                    )}

                    {currency.unbudgetedExpenseTotal > 0 ? (
                      <p className="mt-3 text-sm text-amber-700">
                        Unbudgeted spend:{" "}
                        {formatCurrency(
                          currency.unbudgetedExpenseTotal,
                          currency.currency,
                        )}
                      </p>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </section>
        ) : null}
      </Container>
    </>
  );
}
