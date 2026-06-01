"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type {
  CategoryBudgetOverrideResponse,
  CategoryResponse,
  MonthlyBudgetItemResponse,
  MonthlyBudgetResponse,
} from "@finhance/shared";
import BudgetOverrideForm from "@components/BudgetOverrideForm";
import BudgetPlanForm from "@components/BudgetPlanForm";
import Modal from "@components/Modal";
import { useAppPreferences } from "@components/ThemeProvider";
import { api, apiMutation } from "@lib/api";
import {
  buildBudgetTransactionsLink,
  getBudgetConfidenceMessage,
  getBudgetCreatePanelContext,
  getBudgetQuickFillSuggestions,
  getBudgetStatusLabel,
  sortBudgetItemsForDisplay,
} from "@lib/budgets";
import { formatSensitiveCurrency } from "@lib/money";
import { useSingleFlightActions } from "@lib/single-flight";

type PanelMode = "create" | "edit" | "override";

interface CreatePanelContext {
  categoryId: string;
  currency: string;
  previousMonthExpense: number | null;
  averageExpenseLast3Months: number | null;
}

function formatBudgetDelta(
  item: MonthlyBudgetItemResponse,
  hidden: boolean,
): string {
  if (item.remainingAmount < 0) {
    return `Over by ${formatSensitiveCurrency(
      Math.abs(item.remainingAmount),
      item.currency,
      hidden,
    )}`;
  }

  if (item.remainingAmount === 0) {
    return "Exactly at limit";
  }

  return `${formatSensitiveCurrency(
    item.remainingAmount,
    item.currency,
    hidden,
  )} remaining`;
}

function progressWidth(item: MonthlyBudgetItemResponse): string {
  if (item.usageRatio === null) {
    return item.spentAmount > 0 ? "100%" : "0%";
  }

  return `${Math.max(0, Math.min(100, item.usageRatio * 100))}%`;
}

function getBudgetStatusChipClass(
  status: MonthlyBudgetItemResponse["status"],
): string {
  switch (status) {
    case "OVER_BUDGET":
      return "is-danger";
    case "AT_LIMIT":
      return "is-warning";
    case "WITHIN_BUDGET":
      return "is-success";
    default:
      return "is-neutral";
  }
}

export default function BudgetsPageClient({
  budgetView,
  categories,
}: {
  budgetView: MonthlyBudgetResponse;
  categories: CategoryResponse[];
}) {
  const router = useRouter();
  const [panelMode, setPanelMode] = useState<PanelMode | null>(null);
  const [selectedBudgetId, setSelectedBudgetId] = useState<string | null>(null);
  const [preferredCategoryId, setPreferredCategoryId] = useState<string>("");
  const [preferredCurrency, setPreferredCurrency] = useState<string>("EUR");
  const [createPanelContext, setCreatePanelContext] =
    useState<CreatePanelContext | null>(null);
  const [overrides, setOverrides] = useState<CategoryBudgetOverrideResponse[]>(
    [],
  );
  const [actionError, setActionError] = useState<string | null>(null);
  const [isLoadingOverrides, setIsLoadingOverrides] = useState(false);
  const [busyBudgetId, setBusyBudgetId] = useState<string | null>(null);
  const actions = useSingleFlightActions<string>();
  const { hideMoney, isHydrated } = useAppPreferences();
  const shouldHideMoney = !isHydrated || hideMoney;

  const allBudgetItems = useMemo(
    () => budgetView.currencies.flatMap((currency) => currency.items),
    [budgetView.currencies],
  );
  const selectedBudget =
    allBudgetItems.find((item) => item.budgetId === selectedBudgetId) ?? null;

  const activeExpenseCategories = useMemo(
    () =>
      categories.filter(
        (category) =>
          category.type === "EXPENSE" &&
          (budgetView.includeArchivedCategories ||
            category.archivedAt === null),
      ),
    [budgetView.includeArchivedCategories, categories],
  );

  async function loadOverrides(budgetId: string) {
    await actions.run(`overrides:${budgetId}`, async () => {
      setIsLoadingOverrides(true);

      try {
        setOverrides(
          await api<CategoryBudgetOverrideResponse[]>(
            `/budgets/${budgetId}/overrides`,
          ),
        );
      } catch (error) {
        setActionError(
          error instanceof Error
            ? error.message
            : "Unable to load budget overrides.",
        );
        setOverrides([]);
      } finally {
        setIsLoadingOverrides(false);
      }
    });
  }

  function openCreatePanel(
    nextCategoryId = "",
    nextCurrency = preferredCurrency || "EUR",
    nextContext: CreatePanelContext | null = null,
  ) {
    setPanelMode("create");
    setSelectedBudgetId(null);
    setPreferredCategoryId(nextCategoryId);
    setPreferredCurrency(nextCurrency);
    setCreatePanelContext(nextContext);
    setOverrides([]);
    setActionError(null);
  }

  function closePanel() {
    setPanelMode(null);
    setSelectedBudgetId(null);
    setCreatePanelContext(null);
    setOverrides([]);
    setActionError(null);
  }

  function openEditPanel(budgetId: string) {
    setPanelMode("edit");
    setSelectedBudgetId(budgetId);
    setActionError(null);
  }

  function openOverridePanel(budgetId: string) {
    setPanelMode("override");
    setSelectedBudgetId(budgetId);
    setActionError(null);
    void loadOverrides(budgetId);
  }

  async function handleEndBudget(budgetId: string) {
    await actions.run(`end:${budgetId}`, async () => {
      setActionError(null);
      setBusyBudgetId(budgetId);

      try {
        await apiMutation<void>(
          `/budgets/${budgetId}?effectiveMonth=${encodeURIComponent(budgetView.month)}`,
          {
            method: "DELETE",
          },
        );

        if (selectedBudgetId === budgetId) {
          openCreatePanel();
        }

        router.refresh();
      } catch (error) {
        setActionError(
          error instanceof Error
            ? error.message
            : "Unable to end this budget from the selected month.",
        );
      } finally {
        setBusyBudgetId(null);
      }
    });
  }

  async function handleClearCurrentOverride(item: MonthlyBudgetItemResponse) {
    await actions.run(
      `clear:${item.budgetId}:${budgetView.month}`,
      async () => {
        setActionError(null);
        setBusyBudgetId(item.budgetId);

        try {
          await apiMutation<void>(
            `/budgets/${item.budgetId}/overrides/${budgetView.month}`,
            {
              method: "DELETE",
            },
          );

          if (selectedBudgetId === item.budgetId && panelMode === "override") {
            await loadOverrides(item.budgetId);
          }

          router.refresh();
        } catch (error) {
          setActionError(
            error instanceof Error
              ? error.message
              : "Unable to clear this month override.",
          );
        } finally {
          setBusyBudgetId(null);
        }
      },
    );
  }

  const warningCards = budgetView.currencies.flatMap((currency) => {
    const cards: { key: string; title: string; detail: string }[] = [];

    if (currency.overBudgetCount > 0) {
      cards.push({
        key: `${currency.currency}:over`,
        title: `${currency.overBudgetCount} over-budget categor${
          currency.overBudgetCount === 1 ? "y" : "ies"
        } in ${currency.currency}`,
        detail: `${formatSensitiveCurrency(
          currency.overBudgetTotal,
          currency.currency,
          shouldHideMoney,
        )} above planned spend.`,
      });
    }

    if (currency.unbudgetedExpenseTotal > 0) {
      cards.push({
        key: `${currency.currency}:unbudgeted`,
        title: `Unbudgeted spend in ${currency.currency}`,
        detail: `${formatSensitiveCurrency(
          currency.unbudgetedExpenseTotal,
          currency.currency,
          shouldHideMoney,
        )} is categorized but has no matching budget.`,
      });
    }

    if (currency.uncategorizedExpenseTotal > 0) {
      cards.push({
        key: `${currency.currency}:uncategorized`,
        title: `Uncategorized spend in ${currency.currency}`,
        detail: `${formatSensitiveCurrency(
          currency.uncategorizedExpenseTotal,
          currency.currency,
          shouldHideMoney,
        )} still needs category cleanup before budgets tell the full story.`,
      });
    }

    return cards;
  });

  return (
    <div className="page-shell is-relaxed">
      <section className="route-stack-desktop-xl">
        <div className="page-section is-spacious section-stack-tight">
          <div className="compact-toolbar">
            <div className="page-hero-copy">
              <p className="page-kicker">Planning</p>
              <h2 className="section-title">Budget workspace</h2>
              <p className="section-subtitle">
                Monthly expense plans, manual month overrides, and the gaps that
                still weaken budget trust.
              </p>
            </div>

            <button
              type="button"
              onClick={() => openCreatePanel()}
              className="btn-primary"
            >
              New budget
            </button>
          </div>
        </div>

        {actionError ? (
          <p role="alert" className="page-inline-notice surface-danger">
            {actionError}
          </p>
        ) : null}

        {warningCards.length > 0 ? (
          <div className="grid gap-4 md:grid-cols-2">
            {warningCards.map((warning) => (
              <div
                key={warning.key}
                className="page-inline-notice surface-warning"
              >
                <p className="font-medium">{warning.title}</p>
                <p className="mt-1 text-amber-900/80">{warning.detail}</p>
              </div>
            ))}
          </div>
        ) : (
          <div className="page-inline-notice surface-success">
            No budget warnings for {budgetView.month}.
          </div>
        )}

        {budgetView.currencies.length === 0 ? (
          <div className="page-inline-notice surface-dashed">
            No budgets or expense activity match the selected month.
          </div>
        ) : (
          <div className="list-stack is-loose">
            {budgetView.currencies.map((currency) => (
              <section
                key={currency.currency}
                className="page-section is-spacious section-stack-desktop-xl"
              >
                {(() => {
                  const confidence = getBudgetConfidenceMessage(currency);

                  return (
                    <div
                      className={`mb-5 page-inline-notice ${
                        confidence.tone === "warning"
                          ? "surface-warning"
                          : confidence.tone === "info"
                            ? "surface-info"
                            : "surface-success"
                      }`}
                    >
                      <p className="font-medium">{confidence.title}</p>
                      <p className="mt-1">{confidence.detail}</p>
                    </div>
                  );
                })()}

                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="text-xl font-semibold text-[var(--text-primary)]">
                      {currency.currency}
                    </h3>
                    <p className="mt-1 text-sm text-[var(--text-secondary)]">
                      {budgetView.month} budget coverage and uncovered expense.
                    </p>
                  </div>
                  <div className="text-sm text-[var(--text-secondary)]">
                    {currency.budgetedCategoryCount} budgeted categor
                    {currency.budgetedCategoryCount === 1 ? "y" : "ies"}
                  </div>
                </div>

                <div className="summary-grid is-loose mt-5 sm:grid-cols-2 xl:grid-cols-3">
                  <SummaryCard
                    label="Budgeted"
                    value={formatSensitiveCurrency(
                      currency.budgetTotal,
                      currency.currency,
                      shouldHideMoney,
                    )}
                  />
                  <SummaryCard
                    label="Spent vs budget"
                    value={formatSensitiveCurrency(
                      currency.spentTotal,
                      currency.currency,
                      shouldHideMoney,
                    )}
                  />
                  <SummaryCard
                    label="Remaining"
                    value={formatSensitiveCurrency(
                      currency.remainingTotal,
                      currency.currency,
                      shouldHideMoney,
                    )}
                  />
                  <SummaryCard
                    label="Over budget"
                    value={formatSensitiveCurrency(
                      currency.overBudgetTotal,
                      currency.currency,
                      shouldHideMoney,
                    )}
                  />
                  <SummaryCard
                    label="Unbudgeted"
                    value={formatSensitiveCurrency(
                      currency.unbudgetedExpenseTotal,
                      currency.currency,
                      shouldHideMoney,
                    )}
                  />
                  <SummaryCard
                    label="Uncategorized"
                    value={formatSensitiveCurrency(
                      currency.uncategorizedExpenseTotal,
                      currency.currency,
                      shouldHideMoney,
                    )}
                  />
                </div>

                {currency.items.length === 0 ? (
                  <div className="mt-6 page-inline-notice surface-dashed">
                    No budgeted categories in {currency.currency} for this month
                    yet. Start with the categories already showing spend below
                    or create a fresh plan in the editor.
                  </div>
                ) : (
                  <div className="mt-6 list-stack is-loose">
                    {sortBudgetItemsForDisplay(currency.items).map((item) => {
                      const isBusy = busyBudgetId === item.budgetId;
                      const hasCurrentOverride =
                        item.override?.month === budgetView.month;

                      return (
                        <article
                          key={item.budgetId}
                          className={`list-card is-roomy ${
                            item.status === "OVER_BUDGET"
                              ? "surface-danger"
                              : item.status === "AT_LIMIT"
                                ? "surface-warning"
                                : ""
                          }`}
                        >
                          <div className="flex flex-wrap items-start justify-between gap-5">
                            <div className="section-stack-tight">
                              <div className="flex flex-wrap items-center gap-2">
                                <h4 className="text-lg font-semibold text-[var(--text-primary)]">
                                  {item.categoryName}
                                </h4>
                                <span
                                  className={`status-chip ${getBudgetStatusChipClass(item.status)}`}
                                >
                                  {getBudgetStatusLabel(item.status)}
                                </span>
                                {hasCurrentOverride ? (
                                  <span className="status-chip is-info">
                                    Month override
                                  </span>
                                ) : null}
                              </div>

                              <p className="text-sm text-[var(--text-secondary)]">
                                {formatSensitiveCurrency(
                                  item.spentAmount,
                                  item.currency,
                                  shouldHideMoney,
                                )}{" "}
                                spent against{" "}
                                {formatSensitiveCurrency(
                                  item.budgetAmount,
                                  item.currency,
                                  shouldHideMoney,
                                )}
                                . {formatBudgetDelta(item, shouldHideMoney)}.
                              </p>

                              <div className="h-2 w-full max-w-md overflow-hidden rounded-full bg-gray-100">
                                <div
                                  className={`h-full ${
                                    item.status === "OVER_BUDGET"
                                      ? "bg-red-500"
                                      : item.status === "AT_LIMIT"
                                        ? "bg-amber-500"
                                        : "bg-emerald-500"
                                  }`}
                                  style={{ width: progressWidth(item) }}
                                />
                              </div>

                              <div className="flex flex-wrap gap-3 text-xs font-medium">
                                <span
                                  className={
                                    item.remainingAmount < 0
                                      ? "text-[var(--color-expense)]"
                                      : "text-[var(--text-secondary)]"
                                  }
                                >
                                  Variance{" "}
                                  {formatBudgetDelta(item, shouldHideMoney)}
                                </span>
                                <span className="text-[var(--text-tertiary)]">
                                  Status {getBudgetStatusLabel(item.status)}
                                </span>
                              </div>

                              <div className="metric-strip is-relaxed">
                                <div className="detail-panel is-roomy">
                                  <p className="detail-metric-label">
                                    Prev month
                                  </p>
                                  <p className="detail-metric-value">
                                    {item.previousMonthExpense === null
                                      ? "No history"
                                      : formatSensitiveCurrency(
                                          item.previousMonthExpense,
                                          item.currency,
                                          shouldHideMoney,
                                        )}
                                  </p>
                                </div>
                                <div className="detail-panel is-roomy">
                                  <p className="detail-metric-label">
                                    Avg last 3 months
                                  </p>
                                  <p className="detail-metric-value">
                                    {item.averageExpenseLast3Months === null
                                      ? "No history"
                                      : formatSensitiveCurrency(
                                          item.averageExpenseLast3Months,
                                          item.currency,
                                          shouldHideMoney,
                                        )}
                                  </p>
                                </div>
                              </div>
                            </div>

                            <div className="flex flex-wrap items-center gap-3 text-sm">
                              <Link
                                href={buildBudgetTransactionsLink({
                                  month: budgetView.month,
                                  categoryId: item.categoryId,
                                })}
                                className="link-button"
                              >
                                Transactions
                              </Link>
                              <button
                                type="button"
                                onClick={() => openEditPanel(item.budgetId)}
                                className="link-button"
                              >
                                Edit plan
                              </button>
                              <button
                                type="button"
                                onClick={() => openOverridePanel(item.budgetId)}
                                className="link-button"
                              >
                                Override month
                              </button>
                              {hasCurrentOverride ? (
                                <button
                                  type="button"
                                  onClick={() =>
                                    void handleClearCurrentOverride(item)
                                  }
                                  disabled={isBusy}
                                  className="link-button disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                  {isBusy ? "Clearing..." : "Clear override"}
                                </button>
                              ) : null}
                              <button
                                type="button"
                                onClick={() =>
                                  void handleEndBudget(item.budgetId)
                                }
                                disabled={isBusy}
                                className="link-button is-danger disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                {isBusy ? "Ending..." : "End from this month"}
                              </button>
                            </div>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                )}

                {currency.unbudgetedCategories.length > 0 ? (
                  <div className="mt-6 page-inline-notice surface-warning">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <h4 className="text-sm font-semibold text-[var(--text-primary)]">
                          Unbudgeted categorized spend
                        </h4>
                        <p className="mt-1 text-sm">
                          These expense categories were used this month without
                          a matching budget.
                        </p>
                      </div>
                      <span className="text-sm font-medium text-[var(--text-primary)]">
                        {formatSensitiveCurrency(
                          currency.unbudgetedExpenseTotal,
                          currency.currency,
                          shouldHideMoney,
                        )}
                      </span>
                    </div>

                    <div className="mt-4 subcard-stack is-loose">
                      {currency.unbudgetedCategories.map((item) => (
                        <div
                          key={item.categoryId}
                          className="detail-panel flex flex-wrap items-center justify-between gap-3 text-sm"
                        >
                          <div>
                            <p className="font-medium text-[var(--text-primary)]">
                              {item.categoryName}
                            </p>
                            <p className="mt-1 text-xs text-[var(--text-secondary)]">
                              Prev month:{" "}
                              {item.previousMonthExpense === null
                                ? "No history"
                                : formatSensitiveCurrency(
                                    item.previousMonthExpense,
                                    item.currency,
                                    shouldHideMoney,
                                  )}{" "}
                              • Avg last 3 months:{" "}
                              {item.averageExpenseLast3Months === null
                                ? "No history"
                                : formatSensitiveCurrency(
                                    item.averageExpenseLast3Months,
                                    item.currency,
                                    shouldHideMoney,
                                  )}
                            </p>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="font-medium text-[var(--text-primary)]">
                              {formatSensitiveCurrency(
                                item.spentAmount,
                                item.currency,
                                shouldHideMoney,
                              )}
                            </span>
                            <Link
                              href={buildBudgetTransactionsLink({
                                month: budgetView.month,
                                categoryId: item.categoryId,
                              })}
                              className="link-button"
                            >
                              Transactions
                            </Link>
                            <button
                              type="button"
                              onClick={() =>
                                openCreatePanel(
                                  item.categoryId,
                                  item.currency,
                                  getBudgetCreatePanelContext({
                                    categoryId: item.categoryId,
                                    currency: item.currency,
                                    previousMonthExpense:
                                      item.previousMonthExpense,
                                    averageExpenseLast3Months:
                                      item.averageExpenseLast3Months,
                                  }),
                                )
                              }
                              className="link-button"
                            >
                              Create budget
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}

                {currency.uncategorizedExpenseTotal > 0 ? (
                  <div className="mt-4 page-inline-notice surface-warning surface-dashed">
                    <p className="font-medium">
                      Uncategorized expenses are not budgeted automatically.
                    </p>
                    <p className="mt-1">
                      {formatSensitiveCurrency(
                        currency.uncategorizedExpenseTotal,
                        currency.currency,
                        shouldHideMoney,
                      )}{" "}
                      in {currency.currency} still needs category cleanup before
                      budget coverage is complete.
                    </p>
                    <Link
                      href={buildBudgetTransactionsLink({
                        month: budgetView.month,
                      })}
                      className="mt-2 inline-block link-button"
                    >
                      Open transactions
                    </Link>
                  </div>
                ) : null}
              </section>
            ))}
          </div>
        )}
      </section>

      <Modal
        open={panelMode !== null}
        onClose={closePanel}
        title={
          panelMode === "override"
            ? `Override ${budgetView.month}`
            : panelMode === "edit"
              ? "Edit repeating budget"
              : "Create budget"
        }
        maxWidth={680}
      >
        <p className="section-subtitle">
          {panelMode === "override"
            ? "Set a one-month amount without changing the repeating plan."
            : panelMode === "edit"
              ? "Change the repeating plan from the selected month forward."
              : "Add a monthly expense target for a category and currency."}
        </p>

        <div className="mt-6">
          {panelMode === "override" && selectedBudget ? (
            isLoadingOverrides ? (
              <p className="text-sm text-[var(--text-secondary)]">
                Loading overrides...
              </p>
            ) : (
              <BudgetOverrideForm
                budget={selectedBudget}
                month={budgetView.month}
                overrides={overrides}
                onSuccess={closePanel}
                onCancel={closePanel}
              />
            )
          ) : (
            <BudgetPlanForm
              mode={panelMode === "edit" ? "edit" : "create"}
              budget={panelMode === "edit" ? selectedBudget : null}
              categories={activeExpenseCategories}
              defaultMonth={budgetView.month}
              preferredCategoryId={preferredCategoryId}
              preferredCurrency={preferredCurrency}
              quickFillSuggestions={getBudgetQuickFillSuggestions({
                previousMonthExpense:
                  panelMode === "edit"
                    ? (selectedBudget?.previousMonthExpense ?? null)
                    : (createPanelContext?.previousMonthExpense ?? null),
                averageExpenseLast3Months:
                  panelMode === "edit"
                    ? (selectedBudget?.averageExpenseLast3Months ?? null)
                    : (createPanelContext?.averageExpenseLast3Months ?? null),
              })}
              onSuccess={closePanel}
              onCancel={closePanel}
            />
          )}
        </div>
      </Modal>
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="summary-card text-sm">
      <p className="summary-card-label">{label}</p>
      <p className="summary-card-value">{value}</p>
    </div>
  );
}
