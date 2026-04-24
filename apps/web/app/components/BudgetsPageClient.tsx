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
import { api, apiMutation } from "@lib/api";
import {
  buildBudgetTransactionsLink,
  getBudgetStatusClasses,
  getBudgetStatusLabel,
} from "@lib/budgets";
import { formatCurrency } from "@lib/format";
import { useSingleFlightActions } from "@lib/single-flight";

type PanelMode = "create" | "edit" | "override";

function formatBudgetDelta(item: MonthlyBudgetItemResponse): string {
  if (item.remainingAmount < 0) {
    return `Over by ${formatCurrency(Math.abs(item.remainingAmount), item.currency)}`;
  }

  if (item.remainingAmount === 0) {
    return "Exactly at limit";
  }

  return `${formatCurrency(item.remainingAmount, item.currency)} remaining`;
}

function progressWidth(item: MonthlyBudgetItemResponse): string {
  if (item.usageRatio === null) {
    return item.spentAmount > 0 ? "100%" : "0%";
  }

  return `${Math.max(0, Math.min(100, item.usageRatio * 100))}%`;
}

export default function BudgetsPageClient({
  budgetView,
  categories,
}: {
  budgetView: MonthlyBudgetResponse;
  categories: CategoryResponse[];
}) {
  const router = useRouter();
  const [panelMode, setPanelMode] = useState<PanelMode>("create");
  const [selectedBudgetId, setSelectedBudgetId] = useState<string | null>(null);
  const [preferredCategoryId, setPreferredCategoryId] = useState<string>("");
  const [preferredCurrency, setPreferredCurrency] = useState<string>("EUR");
  const [overrides, setOverrides] = useState<CategoryBudgetOverrideResponse[]>(
    [],
  );
  const [actionError, setActionError] = useState<string | null>(null);
  const [isLoadingOverrides, setIsLoadingOverrides] = useState(false);
  const [busyBudgetId, setBusyBudgetId] = useState<string | null>(null);
  const actions = useSingleFlightActions<string>();

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
  ) {
    setPanelMode("create");
    setSelectedBudgetId(null);
    setPreferredCategoryId(nextCategoryId);
    setPreferredCurrency(nextCurrency);
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
        detail: `${formatCurrency(currency.overBudgetTotal, currency.currency)} above planned spend.`,
      });
    }

    if (currency.unbudgetedExpenseTotal > 0) {
      cards.push({
        key: `${currency.currency}:unbudgeted`,
        title: `Unbudgeted spend in ${currency.currency}`,
        detail: `${formatCurrency(
          currency.unbudgetedExpenseTotal,
          currency.currency,
        )} is categorized but has no matching budget.`,
      });
    }

    if (currency.uncategorizedExpenseTotal > 0) {
      cards.push({
        key: `${currency.currency}:uncategorized`,
        title: `Uncategorized spend in ${currency.currency}`,
        detail: `${formatCurrency(
          currency.uncategorizedExpenseTotal,
          currency.currency,
        )} still needs category cleanup before budgets tell the full story.`,
      });
    }

    return cards;
  });

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1.1fr)_minmax(320px,420px)]">
      <section className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-2xl font-semibold text-gray-900">Budgets</h2>
            <p className="text-sm text-gray-500">
              Monthly expense plans, manual month overrides, and the gaps that
              still weaken budget trust.
            </p>
          </div>

          <button
            type="button"
            onClick={() => openCreatePanel()}
            className="rounded-lg border px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            New budget
          </button>
        </div>

        {actionError ? (
          <p role="alert" className="text-sm text-red-600">
            {actionError}
          </p>
        ) : null}

        {warningCards.length > 0 ? (
          <div className="grid gap-3 md:grid-cols-2">
            {warningCards.map((warning) => (
              <div
                key={warning.key}
                className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950"
              >
                <p className="font-medium">{warning.title}</p>
                <p className="mt-1 text-amber-900/80">{warning.detail}</p>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
            No budget warnings for {budgetView.month}.
          </div>
        )}

        {budgetView.currencies.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-gray-300 bg-white p-6 text-sm text-gray-500">
            No budgets or expense activity match the selected month.
          </div>
        ) : (
          budgetView.currencies.map((currency) => (
            <section
              key={currency.currency}
              className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-gray-100"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-xl font-semibold text-gray-900">
                    {currency.currency}
                  </h3>
                  <p className="mt-1 text-sm text-gray-500">
                    {budgetView.month} budget coverage and uncovered expense.
                  </p>
                </div>
                <div className="text-sm text-gray-500">
                  {currency.budgetedCategoryCount} budgeted categor
                  {currency.budgetedCategoryCount === 1 ? "y" : "ies"}
                </div>
              </div>

              <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                <SummaryCard
                  label="Budgeted"
                  value={formatCurrency(
                    currency.budgetTotal,
                    currency.currency,
                  )}
                />
                <SummaryCard
                  label="Spent vs budget"
                  value={formatCurrency(currency.spentTotal, currency.currency)}
                />
                <SummaryCard
                  label="Remaining"
                  value={formatCurrency(
                    currency.remainingTotal,
                    currency.currency,
                  )}
                />
                <SummaryCard
                  label="Over budget"
                  value={formatCurrency(
                    currency.overBudgetTotal,
                    currency.currency,
                  )}
                />
                <SummaryCard
                  label="Unbudgeted"
                  value={formatCurrency(
                    currency.unbudgetedExpenseTotal,
                    currency.currency,
                  )}
                />
                <SummaryCard
                  label="Uncategorized"
                  value={formatCurrency(
                    currency.uncategorizedExpenseTotal,
                    currency.currency,
                  )}
                />
              </div>

              {currency.items.length === 0 ? (
                <div className="mt-6 rounded-2xl border border-dashed border-gray-300 bg-gray-50 p-5 text-sm text-gray-500">
                  No budgeted categories in {currency.currency} for this month.
                </div>
              ) : (
                <div className="mt-6 space-y-3">
                  {currency.items.map((item) => {
                    const isBusy = busyBudgetId === item.budgetId;
                    const hasCurrentOverride =
                      item.override?.month === budgetView.month;

                    return (
                      <article
                        key={item.budgetId}
                        className="rounded-2xl border border-gray-200 p-4"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-4">
                          <div className="space-y-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <h4 className="text-lg font-semibold text-gray-900">
                                {item.categoryName}
                              </h4>
                              <span
                                className={`rounded-full px-2.5 py-1 text-xs font-medium ${getBudgetStatusClasses(
                                  item.status,
                                )}`}
                              >
                                {getBudgetStatusLabel(item.status)}
                              </span>
                              {hasCurrentOverride ? (
                                <span className="rounded-full bg-blue-100 px-2.5 py-1 text-xs font-medium text-blue-800">
                                  Month override
                                </span>
                              ) : null}
                            </div>

                            <p className="text-sm text-gray-600">
                              {formatCurrency(item.spentAmount, item.currency)}{" "}
                              spent against{" "}
                              {formatCurrency(item.budgetAmount, item.currency)}
                              . {formatBudgetDelta(item)}.
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

                            <div className="flex flex-wrap gap-4 text-xs text-gray-500">
                              <span>
                                Prev month:{" "}
                                {item.previousMonthExpense === null
                                  ? "No history"
                                  : formatCurrency(
                                      item.previousMonthExpense,
                                      item.currency,
                                    )}
                              </span>
                              <span>
                                Avg last 3 months:{" "}
                                {item.averageExpenseLast3Months === null
                                  ? "No history"
                                  : formatCurrency(
                                      item.averageExpenseLast3Months,
                                      item.currency,
                                    )}
                              </span>
                            </div>
                          </div>

                          <div className="flex flex-wrap items-center gap-3 text-sm">
                            <Link
                              href={buildBudgetTransactionsLink({
                                month: budgetView.month,
                                categoryId: item.categoryId,
                              })}
                              className="font-medium text-blue-600 hover:underline"
                            >
                              Transactions
                            </Link>
                            <button
                              type="button"
                              onClick={() => openEditPanel(item.budgetId)}
                              className="font-medium text-gray-700 hover:underline"
                            >
                              Edit plan
                            </button>
                            <button
                              type="button"
                              onClick={() => openOverridePanel(item.budgetId)}
                              className="font-medium text-gray-700 hover:underline"
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
                                className="font-medium text-gray-700 hover:underline disabled:cursor-not-allowed disabled:opacity-60"
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
                              className="font-medium text-red-600 hover:underline disabled:cursor-not-allowed disabled:opacity-60"
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
                <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h4 className="text-sm font-semibold text-amber-950">
                        Unbudgeted categorized spend
                      </h4>
                      <p className="mt-1 text-sm text-amber-900/80">
                        These expense categories were used this month without a
                        matching budget.
                      </p>
                    </div>
                    <span className="text-sm font-medium text-amber-900">
                      {formatCurrency(
                        currency.unbudgetedExpenseTotal,
                        currency.currency,
                      )}
                    </span>
                  </div>

                  <div className="mt-4 space-y-2">
                    {currency.unbudgetedCategories.map((item) => (
                      <div
                        key={item.categoryId}
                        className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-white/80 px-4 py-3 text-sm"
                      >
                        <div>
                          <p className="font-medium text-gray-900">
                            {item.categoryName}
                          </p>
                          <p className="mt-1 text-xs text-gray-500">
                            Prev month:{" "}
                            {item.previousMonthExpense === null
                              ? "No history"
                              : formatCurrency(
                                  item.previousMonthExpense,
                                  item.currency,
                                )}{" "}
                            • Avg last 3 months:{" "}
                            {item.averageExpenseLast3Months === null
                              ? "No history"
                              : formatCurrency(
                                  item.averageExpenseLast3Months,
                                  item.currency,
                                )}
                          </p>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="font-medium text-gray-900">
                            {formatCurrency(item.spentAmount, item.currency)}
                          </span>
                          <Link
                            href={buildBudgetTransactionsLink({
                              month: budgetView.month,
                              categoryId: item.categoryId,
                            })}
                            className="font-medium text-blue-600 hover:underline"
                          >
                            Transactions
                          </Link>
                          <button
                            type="button"
                            onClick={() =>
                              openCreatePanel(item.categoryId, item.currency)
                            }
                            className="font-medium text-gray-700 hover:underline"
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
                <div className="mt-4 rounded-2xl border border-dashed border-amber-300 bg-amber-50/60 p-4 text-sm text-amber-950">
                  <p className="font-medium">
                    Uncategorized expenses are not budgeted automatically.
                  </p>
                  <p className="mt-1">
                    {formatCurrency(
                      currency.uncategorizedExpenseTotal,
                      currency.currency,
                    )}{" "}
                    in {currency.currency} still needs category cleanup before
                    budget coverage is complete.
                  </p>
                  <Link
                    href={buildBudgetTransactionsLink({
                      month: budgetView.month,
                    })}
                    className="mt-2 inline-block font-medium text-blue-600 hover:underline"
                  >
                    Open transactions
                  </Link>
                </div>
              ) : null}
            </section>
          ))
        )}
      </section>

      <aside className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-gray-100">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">
              {panelMode === "create"
                ? "Create budget"
                : panelMode === "edit"
                  ? "Edit repeating budget"
                  : `Override ${budgetView.month}`}
            </h2>
            <p className="mt-1 text-sm text-gray-500">
              {panelMode === "create"
                ? "Add a monthly expense target for a category and currency."
                : panelMode === "edit"
                  ? "Change the repeating plan from the selected month forward."
                  : "Set a one-month amount without changing the repeating plan."}
            </p>
          </div>
          {panelMode !== "create" ? (
            <button
              type="button"
              onClick={() => openCreatePanel()}
              className="text-sm font-medium text-gray-600 hover:text-gray-900"
            >
              New budget
            </button>
          ) : null}
        </div>

        <div className="mt-6">
          {panelMode === "override" && selectedBudget ? (
            isLoadingOverrides ? (
              <p className="text-sm text-gray-500">Loading overrides...</p>
            ) : (
              <BudgetOverrideForm
                budget={selectedBudget}
                month={budgetView.month}
                overrides={overrides}
                onSuccess={() => {
                  void loadOverrides(selectedBudget.budgetId);
                }}
                onCancel={() => openCreatePanel()}
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
              onSuccess={() => {
                if (panelMode !== "create") {
                  openCreatePanel();
                }
              }}
              onCancel={
                panelMode === "create" ? undefined : () => openCreatePanel()
              }
            />
          )}
        </div>
      </aside>
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-gray-50 px-4 py-3 text-sm">
      <p className="text-xs uppercase tracking-wide text-gray-500">{label}</p>
      <p className="mt-1 font-semibold text-gray-900">{value}</p>
    </div>
  );
}
