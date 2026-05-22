import Link from "next/link";
import type {
  AccountResponse,
  DashboardAssetResponse,
  DashboardResponse,
  MonthlyBudgetResponse,
  SetupStatusResponse,
} from "@finhance/shared";
import Container from "@components/Container";
import DashboardClient from "@components/DashboardClient";
import MoneyValue from "@components/MoneyValue";
import WorkflowSection from "@components/WorkflowSection";
import { getCurrentRomeMonth } from "@lib/budgets";
import { api } from "@lib/server-api";
import { getPrimarySetupAction, getSetupProgressLabel } from "@lib/setup";
import { getWorkflowCards } from "@lib/workflow";

function BudgetMetric({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="glass-card home-budget-metric">
      <p className="detail-metric-label home-budget-metric-label">{label}</p>
      <p className="home-budget-metric-value">{value}</p>
    </div>
  );
}

export default async function DashboardRouteContent() {
  let dashboard: DashboardResponse | null = null;
  let budgetView: MonthlyBudgetResponse | null = null;
  let accounts: AccountResponse[] | null = null;
  let setup: SetupStatusResponse | null = null;
  let errorMessage: string | null = null;

  try {
    [dashboard, budgetView, accounts] = await Promise.all([
      api<DashboardResponse>("/dashboard"),
      api<MonthlyBudgetResponse>(
        `/budgets?month=${encodeURIComponent(getCurrentRomeMonth())}`,
      ),
      api<AccountResponse[]>("/accounts"),
    ]);
  } catch (error) {
    errorMessage =
      error instanceof Error
        ? error.message
        : "Dashboard data is currently unavailable.";
  }

  if (dashboard) {
    try {
      setup = await api<SetupStatusResponse>("/setup/status?includeWarnings=false");
    } catch {
      setup = null;
    }
  }

  if (!dashboard) {
    return (
      <Container>
        <h2 className="text-2xl font-semibold">Dashboard unavailable</h2>
        <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-6 text-amber-950">
          <p className="font-medium">The web app could not reach the API.</p>
          <p className="mt-2 text-sm text-amber-900/80">
            {errorMessage ?? "Start the API and refresh the page."}
          </p>
        </div>
      </Container>
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
  const workflowCards =
    setup && setup.isComplete
      ? getWorkflowCards({
          currentPage: "dashboard",
          month: budgetView?.month ?? getCurrentRomeMonth(),
          setup,
        })
      : [];
  const brokerageAccountIds = new Set(
    (accounts ?? [])
      .filter((account) => account.type === "BROKER" && account.archivedAt === null)
      .map((account) => account.id),
  );

  return (
    <Container>
      <h2 className="home-summary-title">Summary</h2>

      {setup && !setup.isComplete ? (
        <section className="glass-card home-setup-card">
          <div className="home-section-header">
            <div>
              <p className="home-setup-kicker">Setup checklist</p>
              <h3 className="home-setup-title">
                Your trust baseline is not complete yet
              </h3>
              <p className="home-setup-copy">
                {getSetupProgressLabel(setup)}. Finish the baseline first, then
                move into monthly close, analytics, budgets, and recurring
                workflows with fewer surprises.
              </p>
            </div>
            <Link href="/setup" className="btn-primary">
              Open setup
            </Link>
          </div>

          {(() => {
            const primaryAction = getPrimarySetupAction(setup);

            if (!primaryAction) {
              return null;
            }

            return (
              <div className="glass-card home-setup-next">
                <p className="home-setup-next-label">Best next action</p>
                <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="home-setup-next-title">{primaryAction.title}</p>
                    <p className="home-setup-next-detail">{primaryAction.detail}</p>
                  </div>
                  <Link href={primaryAction.href} className="btn-primary">
                    {primaryAction.actionLabel}
                  </Link>
                </div>
              </div>
            );
          })()}
        </section>
      ) : null}

      <DashboardClient
        grouped={grouped}
        kindTotalsArray={kindTotalsArray}
        baseCurrency={dashboard.baseCurrency}
        lastRefreshAt={dashboard.lastRefreshAt}
        summary={dashboard.summary}
        assetKindOrder={dashboard.assetKindOrder}
        brokerageAccountIds={[...brokerageAccountIds]}
      />

      {budgetView ? (
        <section className="glass-card home-budget-section">
          <div className="home-section-header">
            <div>
              <h3 className="home-budget-title">Budgets</h3>
              <p className="home-budget-copy">
                Current-month budget coverage and the categories already breaking
                plan.
              </p>
            </div>
            <Link
              href={`/budgets?month=${encodeURIComponent(budgetView.month)}`}
              className="btn-primary"
            >
              Open budgets
            </Link>
          </div>

          {budgetView.currencies.length === 0 ? (
            <div className="home-budget-empty">
              No budgets or expense activity for {budgetView.month}.
            </div>
          ) : (
            <div className="home-budget-grid">
              {budgetView.currencies.map((currency) => (
                <div key={currency.currency} className="glass-card home-budget-card">
                  <div className="flex items-center justify-between gap-3">
                    <h4 className="home-budget-currency">{currency.currency}</h4>
                    <span className="home-budget-count">
                      {currency.budgetedCategoryCount} budgeted
                    </span>
                  </div>

                  <div className="home-budget-metrics">
                    <BudgetMetric
                      label="Spent vs budget"
                      value={
                        <>
                          <MoneyValue
                            value={currency.spentTotal}
                            currency={currency.currency}
                          />{" "}
                          /{" "}
                          <MoneyValue
                            value={currency.budgetTotal}
                            currency={currency.currency}
                          />
                        </>
                      }
                    />
                    <BudgetMetric
                      label="Remaining"
                      value={
                        <MoneyValue
                          value={currency.remainingTotal}
                          currency={currency.currency}
                        />
                      }
                    />
                  </div>

                  {currency.overBudgetHighlights.length > 0 ? (
                    <div className="mt-4 space-y-2">
                      <p className="home-budget-highlights-title">
                        Top over-budget categories
                      </p>
                      {currency.overBudgetHighlights.map((item) => (
                        <div
                          key={item.budgetId}
                          className="home-budget-highlight-row"
                        >
                          <span>{item.categoryName}</span>
                          <span className="font-medium">
                            <MoneyValue
                              value={item.spentAmount - item.budgetAmount}
                              currency={item.currency}
                            />
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="home-budget-success">
                      No categories are over budget in {currency.currency}.
                    </p>
                  )}

                  {currency.unbudgetedExpenseTotal > 0 ? (
                    <p className="home-budget-unbudgeted">
                      Unbudgeted spend:{" "}
                      <MoneyValue
                        value={currency.unbudgetedExpenseTotal}
                        currency={currency.currency}
                      />
                    </p>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </section>
      ) : null}

      <WorkflowSection
        title="Use the current month"
        description="Move from today’s summary into the month-level workflow: explain it, compare it with plan, and place it in trend context."
        cards={workflowCards}
      />
    </Container>
  );
}
