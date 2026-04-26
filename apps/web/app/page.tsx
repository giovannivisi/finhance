import Link from "next/link";
import Container from "@components/Container";
import type {
  DashboardAssetResponse,
  DashboardResponse,
  MonthlyBudgetResponse,
  SetupStatusResponse,
} from "@finhance/shared";
import { api } from "@lib/api";
import DashboardClient from "@components/DashboardClient";
import WorkflowSection from "@components/WorkflowSection";
import { getCurrentRomeMonth } from "@lib/budgets";
import { formatCurrency } from "@lib/format";
import { getPrimarySetupAction, getSetupProgressLabel } from "@lib/setup";
import { getWorkflowCards } from "@lib/workflow";

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
      setup = await api<SetupStatusResponse>(
        "/setup/status?includeWarnings=false",
      );
    } catch {
      setup = null;
    }
  }

  if (!dashboard) {
    return (
      <>
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
  const workflowCards =
    setup && setup.isComplete
      ? getWorkflowCards({
          currentPage: "dashboard",
          month: budgetView?.month ?? getCurrentRomeMonth(),
          setup,
        })
      : [];

  return (
    <>
      <Container>
        <h2 className="text-2xl font-semibold">Summary</h2>

        {setup && !setup.isComplete ? (
          <section
            className="glass-card mb-6"
            style={{ padding: "24px", borderColor: "var(--color-primary)" }}
          >
            <div className="flex justify-between items-center gap-4">
              <div>
                <p
                  style={{
                    color: "var(--color-primary)",
                    fontSize: "14px",
                    fontWeight: 600,
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                  }}
                >
                  Setup checklist
                </p>
                <h3
                  className="mt-2 text-2xl font-semibold"
                  style={{ color: "var(--text-primary)" }}
                >
                  Your trust baseline is not complete yet
                </h3>
                <p
                  className="mt-2 text-sm"
                  style={{ color: "var(--text-secondary)" }}
                >
                  {getSetupProgressLabel(setup)}. Finish the baseline first,
                  then move into review, analytics, budgets, and recurring
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
                <div
                  className="glass-card mt-4"
                  style={{
                    padding: "16px",
                    background: "var(--bg-card-hover)",
                  }}
                >
                  <p
                    style={{
                      fontSize: "12px",
                      color: "var(--text-secondary)",
                      textTransform: "uppercase",
                    }}
                  >
                    Best next action
                  </p>
                  <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p
                        className="font-semibold"
                        style={{ color: "var(--text-primary)" }}
                      >
                        {primaryAction.title}
                      </p>
                      <p
                        className="mt-1 text-sm"
                        style={{ color: "var(--text-secondary)" }}
                      >
                        {primaryAction.detail}
                      </p>
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
        />

        <WorkflowSection
          title="Use the current month"
          description="Move from today’s summary into the month-level workflow: explain it, compare it with plan, and place it in trend context."
          cards={workflowCards}
        />

        {budgetView ? (
          <section className="glass-card mt-6" style={{ padding: "32px" }}>
            <div className="flex justify-between items-center gap-3">
              <div>
                <h3
                  className="text-2xl font-semibold"
                  style={{ color: "var(--text-primary)" }}
                >
                  Budgets
                </h3>
                <p
                  className="mt-1 text-sm"
                  style={{ color: "var(--text-secondary)" }}
                >
                  Current-month budget coverage and the categories already
                  breaking plan.
                </p>
              </div>
              <Link
                href={`/budgets?month=${encodeURIComponent(budgetView.month)}`}
                style={{
                  color: "var(--color-primary)",
                  fontWeight: 500,
                  fontSize: "14px",
                  textDecoration: "none",
                }}
              >
                Open budgets
              </Link>
            </div>

            {budgetView.currencies.length === 0 ? (
              <div
                className="mt-5 rounded-2xl border p-5 text-sm"
                style={{
                  borderColor: "var(--border-glass-strong)",
                  color: "var(--text-secondary)",
                }}
              >
                No budgets or expense activity for {budgetView.month}.
              </div>
            ) : (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
                  gap: "16px",
                  marginTop: "20px",
                }}
              >
                {budgetView.currencies.map((currency) => (
                  <div
                    key={currency.currency}
                    className="glass-card"
                    style={{ padding: "24px" }}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <h4
                        className="text-lg font-semibold"
                        style={{ color: "var(--text-primary)" }}
                      >
                        {currency.currency}
                      </h4>
                      <span
                        className="text-sm"
                        style={{ color: "var(--text-secondary)" }}
                      >
                        {currency.budgetedCategoryCount} budgeted
                      </span>
                    </div>

                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "1fr 1fr",
                        gap: "12px",
                        marginTop: "16px",
                      }}
                    >
                      <div
                        className="glass-card"
                        style={{
                          padding: "16px",
                          background: "var(--bg-card-hover)",
                        }}
                      >
                        <p
                          style={{
                            fontSize: "10px",
                            textTransform: "uppercase",
                            color: "var(--text-secondary)",
                          }}
                        >
                          Spent vs budget
                        </p>
                        <p style={{ fontWeight: 600, marginTop: "4px" }}>
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
                      <div
                        className="glass-card"
                        style={{
                          padding: "16px",
                          background: "var(--bg-card-hover)",
                        }}
                      >
                        <p
                          style={{
                            fontSize: "10px",
                            textTransform: "uppercase",
                            color: "var(--text-secondary)",
                          }}
                        >
                          Remaining
                        </p>
                        <p style={{ fontWeight: 600, marginTop: "4px" }}>
                          {formatCurrency(
                            currency.remainingTotal,
                            currency.currency,
                          )}
                        </p>
                      </div>
                    </div>

                    {currency.overBudgetHighlights.length > 0 ? (
                      <div className="mt-4 space-y-2">
                        <p
                          className="text-sm font-medium"
                          style={{ color: "var(--text-primary)" }}
                        >
                          Top over-budget categories
                        </p>
                        {currency.overBudgetHighlights.map((item) => (
                          <div
                            key={item.budgetId}
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "center",
                              padding: "8px 12px",
                              background: "rgba(244, 63, 94, 0.1)",
                              borderRadius: "8px",
                              color: "var(--color-expense)",
                              marginTop: "8px",
                            }}
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
                      <p
                        className="mt-4 text-sm"
                        style={{ color: "var(--color-income)" }}
                      >
                        No categories are over budget in {currency.currency}.
                      </p>
                    )}

                    {currency.unbudgetedExpenseTotal > 0 ? (
                      <p
                        className="mt-3 text-sm"
                        style={{ color: "var(--color-expense)" }}
                      >
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
