import Link from "next/link";
import type { DashboardSupportDataResponse } from "@finhance/shared";
import MoneyValue from "@components/MoneyValue";
import WorkflowSection from "@components/WorkflowSection";
import { getCurrentRomeMonth } from "@lib/budgets";
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

export default function DashboardSupportDataClient({
  supportData,
}: {
  supportData: DashboardSupportDataResponse | null;
}) {
  if (!supportData) {
    return null;
  }

  const { budgetView, setup } = supportData;
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
                    <p className="home-setup-next-title">
                      {primaryAction.title}
                    </p>
                    <p className="home-setup-next-detail">
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

      {budgetView ? (
        <section className="glass-card home-budget-section">
          <div className="home-section-header">
            <div>
              <h3 className="home-budget-title">Budgets</h3>
              <p className="home-budget-copy">
                Current-month budget coverage and the categories already
                breaking plan.
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
                <div
                  key={currency.currency}
                  className="glass-card home-budget-card"
                >
                  <div className="flex items-center justify-between gap-3">
                    <h4 className="home-budget-currency">
                      {currency.currency}
                    </h4>
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
        description="Move from today's summary into the month-level workflow: explain it, compare it with plan, and place it in trend context."
        cards={workflowCards}
      />
    </>
  );
}
