"use client";

import Link from "next/link";
import { useEffect, useLayoutEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { MoreHorizontal } from "lucide-react";
import type {
  CategoryBudgetOverrideResponse,
  CategoryResponse,
  MonthlyBudgetCurrencySummaryResponse,
  MonthlyBudgetItemResponse,
  MonthlyBudgetResponse,
} from "@finhance/shared";
import BudgetOverrideForm from "@components/BudgetOverrideForm";
import BudgetPlanForm from "@components/BudgetPlanForm";
import Modal from "@components/Modal";
import { useAppPreferences } from "@components/ThemeProvider";
import WorkflowSection from "@components/WorkflowSection";
import { api, apiMutation } from "@lib/api";
import {
  type BudgetFilters,
  buildBudgetMonthNavigationLink,
  buildBudgetTransactionsLink,
  getBudgetFilterSummaryStatus,
  getBudgetCreatePanelContext,
  getBudgetQuickFillSuggestions,
  getBudgetStatusLabel,
  sortBudgetItemsForDisplay,
} from "@lib/budgets";
import { groupRowsByPrimary } from "@lib/hierarchical-categories";
import { formatSensitiveCurrency } from "@lib/money";
import { useSingleFlightActions } from "@lib/single-flight";
import type { WorkflowCard } from "@lib/workflow";

type PanelMode = "create" | "edit" | "override";

interface CreatePanelContext {
  categoryId: string;
  currency: string;
  previousMonthExpense: number | null;
  averageExpenseLast3Months: number | null;
}

interface BudgetWarningEntry {
  key: string;
  title: string;
  detail: string;
  actionHref?: string;
  actionLabel?: string;
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

function getCurrencyWarnings(
  currency: MonthlyBudgetCurrencySummaryResponse,
  hidden: boolean,
  month: string,
): BudgetWarningEntry[] {
  const warnings: BudgetWarningEntry[] = [];

  if (currency.overBudgetCount > 0) {
    warnings.push({
      key: `${currency.currency}:over-budget`,
      title: `${currency.overBudgetCount} over-budget categor${
        currency.overBudgetCount === 1 ? "y" : "ies"
      }`,
      detail: `${formatSensitiveCurrency(
        currency.overBudgetTotal,
        currency.currency,
        hidden,
      )} above plan across the selected month.`,
      actionHref: buildBudgetTransactionsLink({
        month,
      }),
      actionLabel: "Review transactions",
    });
  }

  return warnings;
}

export default function BudgetsPageClient({
  budgetView,
  categories,
  filters,
  budgetMonthPillLabel,
  workflowCards,
}: {
  budgetView: MonthlyBudgetResponse;
  categories: CategoryResponse[];
  filters: BudgetFilters;
  budgetMonthPillLabel: string;
  workflowCards: WorkflowCard[];
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
  const [openWarningsByCurrency, setOpenWarningsByCurrency] = useState<
    Record<string, boolean>
  >({});
  const [openBudgetActionMenuId, setOpenBudgetActionMenuId] = useState<
    string | null
  >(null);
  const [budgetActionMenuPlacement, setBudgetActionMenuPlacement] = useState<
    "above" | "below"
  >("below");
  const actions = useSingleFlightActions<string>();
  const { hideMoney, isHydrated } = useAppPreferences();
  const shouldHideMoney = !isHydrated || hideMoney;

  useEffect(() => {
    function handlePointerDown(event: PointerEvent) {
      const target = event.target;
      if (!(target instanceof Element)) {
        return;
      }

      if (target.closest(".budget-item-action-menu")) {
        return;
      }

      setOpenBudgetActionMenuId(null);
    }

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, []);

  useLayoutEffect(() => {
    if (!openBudgetActionMenuId) {
      return;
    }

    function updatePlacement() {
      const menuAnchor = document.querySelector<HTMLElement>(
        `[data-budget-action-menu-id="${openBudgetActionMenuId}"]`,
      );
      const menuPanel = menuAnchor?.querySelector<HTMLElement>(
        ".budget-item-action-panel",
      );

      if (!menuAnchor || !menuPanel) {
        return;
      }

      const anchorRect = menuAnchor.getBoundingClientRect();
      const panelHeight = menuPanel.offsetHeight;
      const gap = 12;
      const spaceBelow = window.innerHeight - anchorRect.bottom;
      const spaceAbove = anchorRect.top;

      setBudgetActionMenuPlacement(
        spaceBelow < panelHeight + gap && spaceAbove > spaceBelow
          ? "above"
          : "below",
      );
    }

    updatePlacement();
    window.addEventListener("resize", updatePlacement);
    window.addEventListener("scroll", updatePlacement, true);

    return () => {
      window.removeEventListener("resize", updatePlacement);
      window.removeEventListener("scroll", updatePlacement, true);
    };
  }, [openBudgetActionMenuId]);

  const allBudgetItems = useMemo(
    () => budgetView.currencies.flatMap((currency) => currency.items),
    [budgetView.currencies],
  );
  const selectedBudget =
    allBudgetItems.find((item) => item.budgetId === selectedBudgetId) ?? null;

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

  return (
    <div className="page-shell is-relaxed">
      <section className="route-stack-desktop-xl">
        <section className="page-hero">
          <div className="section-stack-relaxed">
            <div className="page-hero-row">
              <div className="page-hero-copy">
                <p className="page-kicker">Planning</p>
                <h1 className="page-title is-compact">Budgets</h1>
                <p className="page-description">
                  Monthly expense plans with manual month overrides and clear
                  visibility into uncovered spend.
                </p>
              </div>
            </div>

            <div className="budget-hero-toolbar">
              <div className="budget-hero-month-nav">
                <Link
                  href={buildBudgetMonthNavigationLink({
                    month: budgetView.month,
                    delta: -1,
                    includeArchivedCategories:
                      filters.includeArchivedCategories,
                  })}
                  className="btn-secondary"
                >
                  Previous
                </Link>
                <div
                  className="page-pill budget-hero-month-pill"
                  aria-label={`Current month ${budgetMonthPillLabel}`}
                >
                  {budgetMonthPillLabel}
                </div>
                <Link
                  href={buildBudgetMonthNavigationLink({
                    month: budgetView.month,
                    delta: 1,
                    includeArchivedCategories:
                      filters.includeArchivedCategories,
                  })}
                  className="btn-secondary"
                >
                  Next
                </Link>
              </div>

              <button
                type="button"
                onClick={() => openCreatePanel()}
                className="btn-primary budget-hero-create-btn"
              >
                New budget
              </button>
            </div>

            <details className="analytics-filter-shell">
              <summary className="analytics-filter-summary">
                <span className="analytics-filter-summary-copy">
                  <span className="analytics-filter-summary-title">Filter</span>
                  <span className="analytics-filter-summary-detail">
                    Month and archived-category scope.
                  </span>
                </span>
                <span className="analytics-filter-summary-meta">
                  <span className="analytics-filter-summary-status">
                    {getBudgetFilterSummaryStatus({
                      monthLabel: budgetMonthPillLabel,
                      includeArchivedCategories:
                        filters.includeArchivedCategories,
                    })}
                  </span>
                  <span
                    className="analytics-filter-summary-chevron"
                    aria-hidden="true"
                  />
                </span>
              </summary>

              <form className="filter-grid is-relaxed budget-filter-grid">
                <div className="app-form-field">
                  <label htmlFor="budget-month">Month</label>
                  <input
                    id="budget-month"
                    type="month"
                    name="month"
                    defaultValue={filters.month}
                  />
                </div>

                <div className="app-form-field budget-filter-field--offset">
                  <label className="page-pill budget-toggle-pill">
                    <input
                      id="budget-archived"
                      type="checkbox"
                      name="includeArchivedCategories"
                      value="true"
                      defaultChecked={filters.includeArchivedCategories}
                    />
                    Archived categories
                  </label>
                </div>

                <div className="app-form-field budget-filter-field--offset">
                  <div className="filter-actions is-equal budget-filter-actions">
                    <button type="submit" className="btn-primary">
                      Apply
                    </button>
                    <Link href="/budgets" className="btn-secondary">
                      Clear
                    </Link>
                  </div>
                </div>
              </form>
            </details>
          </div>
        </section>

        {actionError ? (
          <p role="alert" className="page-inline-notice surface-danger">
            {actionError}
          </p>
        ) : null}

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
                  const currencyWarnings = getCurrencyWarnings(
                    currency,
                    shouldHideMoney,
                    budgetView.month,
                  );
                  const hasWarnings = currencyWarnings.length > 0;
                  const isWarningsOpen =
                    openWarningsByCurrency[currency.currency] ?? false;
                  const uncoveredCategoryCount =
                    currency.unbudgetedCategories.length;

                  return (
                    <>
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="text-xl font-semibold text-[var(--text-primary)]">
                              {currency.currency}
                            </h3>
                            {hasWarnings ? (
                              <span className="status-chip is-warning">
                                WARNING
                              </span>
                            ) : null}
                          </div>
                          <p className="mt-1 text-sm text-[var(--text-secondary)]">
                            {budgetView.month} budget coverage and uncovered
                            expense.
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
                      </div>

                      {currency.items.length === 0 ? (
                        <p className="budget-empty-note">
                          No budgeted categories in {currency.currency} for this
                          month yet. Start with the categories already showing
                          spend below or create a fresh plan in the editor.
                        </p>
                      ) : (
                        <div className="mt-6 list-stack is-loose">
                          {groupRowsByPrimary(
                            sortBudgetItemsForDisplay(currency.items),
                            (item) => item.categoryName,
                          ).map((group) => (
                            <div
                              key={group.key}
                              className="section-stack-tight"
                            >
                              <div className="flex items-center justify-between gap-3 px-1">
                                <h4 className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--text-tertiary)]">
                                  {group.label}
                                </h4>
                                <span className="text-xs text-[var(--text-tertiary)]">
                                  {group.items.length} budget
                                  {group.items.length === 1 ? "" : "s"}
                                </span>
                              </div>

                              <div className="subcard-stack is-loose">
                                {group.items.map((item) => {
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
                                        <div className="section-stack-tight budget-item-main">
                                          <div className="flex flex-wrap items-center gap-2">
                                            <h5 className="text-lg font-semibold text-[var(--text-primary)]">
                                              {item.secondaryCategoryName ??
                                                item.categoryName}
                                            </h5>
                                            <span
                                              className={`status-chip ${getBudgetStatusChipClass(item.status)}`}
                                            >
                                              {getBudgetStatusLabel(
                                                item.status,
                                              )}
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
                                            .{" "}
                                            {formatBudgetDelta(
                                              item,
                                              shouldHideMoney,
                                            )}
                                            .
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
                                              style={{
                                                width: progressWidth(item),
                                              }}
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
                                              {formatBudgetDelta(
                                                item,
                                                shouldHideMoney,
                                              )}
                                            </span>
                                            <span className="text-[var(--text-tertiary)]">
                                              Status{" "}
                                              {getBudgetStatusLabel(
                                                item.status,
                                              )}
                                            </span>
                                          </div>

                                          <div className="metric-strip is-relaxed budget-item-metrics">
                                            <div className="detail-panel is-roomy">
                                              <p className="detail-metric-label">
                                                Prev month
                                              </p>
                                              <p className="detail-metric-value">
                                                {item.previousMonthExpense ===
                                                null
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
                                                {item.averageExpenseLast3Months ===
                                                null
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

                                        <div
                                          className="budget-item-actions budget-item-action-menu"
                                          data-budget-action-menu-id={
                                            item.budgetId
                                          }
                                        >
                                          <button
                                            type="button"
                                            aria-haspopup="menu"
                                            aria-expanded={
                                              openBudgetActionMenuId ===
                                              item.budgetId
                                            }
                                            aria-controls={`budget-item-actions-${item.budgetId}`}
                                            onClick={() =>
                                              setOpenBudgetActionMenuId(
                                                (current) =>
                                                  current === item.budgetId
                                                    ? null
                                                    : item.budgetId,
                                              )
                                            }
                                            className="btn-secondary budget-item-action-trigger"
                                          >
                                            <MoreHorizontal
                                              size={16}
                                              aria-hidden="true"
                                            />
                                            <span>Options</span>
                                          </button>

                                          {openBudgetActionMenuId ===
                                          item.budgetId ? (
                                            <div
                                              id={`budget-item-actions-${item.budgetId}`}
                                              role="menu"
                                              className={`budget-item-action-panel${
                                                budgetActionMenuPlacement ===
                                                "above"
                                                  ? " is-above"
                                                  : ""
                                              }`}
                                            >
                                              <Link
                                                href={buildBudgetTransactionsLink(
                                                  {
                                                    month: budgetView.month,
                                                    primaryCategoryId:
                                                      item.primaryCategoryId,
                                                    secondaryCategoryId:
                                                      item.secondaryCategoryId ??
                                                      item.categoryId,
                                                  },
                                                )}
                                                className="budget-item-action-link"
                                                onClick={() =>
                                                  setOpenBudgetActionMenuId(
                                                    null,
                                                  )
                                                }
                                              >
                                                <span>Transactions</span>
                                              </Link>
                                              <button
                                                type="button"
                                                onClick={() => {
                                                  setOpenBudgetActionMenuId(
                                                    null,
                                                  );
                                                  openEditPanel(item.budgetId);
                                                }}
                                                className="budget-item-action-link"
                                              >
                                                <span>Edit plan</span>
                                              </button>
                                              <button
                                                type="button"
                                                onClick={() => {
                                                  setOpenBudgetActionMenuId(
                                                    null,
                                                  );
                                                  openOverridePanel(
                                                    item.budgetId,
                                                  );
                                                }}
                                                className="budget-item-action-link"
                                              >
                                                <span>Override month</span>
                                              </button>
                                              {hasCurrentOverride ? (
                                                <button
                                                  type="button"
                                                  onClick={() => {
                                                    setOpenBudgetActionMenuId(
                                                      null,
                                                    );
                                                    void handleClearCurrentOverride(
                                                      item,
                                                    );
                                                  }}
                                                  disabled={isBusy}
                                                  className="budget-item-action-link disabled:cursor-not-allowed disabled:opacity-60"
                                                >
                                                  <span>
                                                    {isBusy
                                                      ? "Clearing..."
                                                      : "Clear override"}
                                                  </span>
                                                </button>
                                              ) : null}
                                              <div
                                                className="budget-item-action-divider"
                                                aria-hidden="true"
                                              />
                                              <button
                                                type="button"
                                                onClick={() => {
                                                  setOpenBudgetActionMenuId(
                                                    null,
                                                  );
                                                  void handleEndBudget(
                                                    item.budgetId,
                                                  );
                                                }}
                                                disabled={isBusy}
                                                className="budget-item-action-link is-danger disabled:cursor-not-allowed disabled:opacity-60"
                                              >
                                                <span>
                                                  {isBusy
                                                    ? "Ending..."
                                                    : "End from this month"}
                                                </span>
                                              </button>
                                            </div>
                                          ) : null}
                                        </div>
                                      </div>
                                    </article>
                                  );
                                })}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {hasWarnings ? (
                        <section className="mt-6 section-stack-tight">
                          <div className="compact-toolbar">
                            <div>
                              <h4 className="text-sm font-semibold text-[var(--text-primary)]">
                                Warnings to review
                              </h4>
                              <p className="mt-1 text-sm text-[var(--text-secondary)]">
                                {currencyWarnings.length} warning
                                {currencyWarnings.length === 1 ? "" : "s"}
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={() =>
                                setOpenWarningsByCurrency((current) => ({
                                  ...current,
                                  [currency.currency]:
                                    !current[currency.currency],
                                }))
                              }
                              className="btn-secondary"
                            >
                              {isWarningsOpen
                                ? "Hide warnings"
                                : `Show ${currencyWarnings.length} warning${
                                    currencyWarnings.length === 1 ? "" : "s"
                                  }`}
                            </button>
                          </div>

                          {!isWarningsOpen ? (
                            <p className="page-inline-notice surface-dashed surface-warning">
                              {currencyWarnings.length} warning
                              {currencyWarnings.length === 1 ? "" : "s"} hidden.
                              Open this section only when you want to inspect
                              the affected categories.
                            </p>
                          ) : (
                            <div className="subcard-stack is-loose">
                              {currencyWarnings.map((warning) => (
                                <article
                                  key={warning.key}
                                  className="page-inline-notice surface-warning"
                                >
                                  <div className="flex flex-wrap items-start justify-between gap-3">
                                    <div>
                                      <p className="font-medium">
                                        {warning.title}
                                      </p>
                                      <p className="mt-1">{warning.detail}</p>
                                    </div>
                                    {warning.actionHref &&
                                    warning.actionLabel ? (
                                      <Link
                                        href={warning.actionHref}
                                        className="link-button is-warning"
                                      >
                                        {warning.actionLabel}
                                      </Link>
                                    ) : null}
                                  </div>

                                  {warning.key.endsWith(":over-budget") &&
                                  currency.overBudgetHighlights.length > 0 ? (
                                    <div className="mt-4 subcard-stack is-loose">
                                      {currency.overBudgetHighlights
                                        .slice(0, 3)
                                        .map((item) => (
                                          <div
                                            key={item.budgetId}
                                            className="detail-panel is-compact flex flex-wrap items-center justify-between gap-3"
                                          >
                                            <div className="section-stack-tight">
                                              <p className="font-medium text-[var(--text-primary)]">
                                                {item.secondaryCategoryName ??
                                                  item.categoryName}
                                              </p>
                                              <p className="text-xs text-[var(--text-secondary)]">
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
                                              </p>
                                            </div>
                                            <span className="status-chip is-danger">
                                              Over by{" "}
                                              {formatSensitiveCurrency(
                                                Math.abs(item.remainingAmount),
                                                item.currency,
                                                shouldHideMoney,
                                              )}
                                            </span>
                                          </div>
                                        ))}
                                    </div>
                                  ) : null}
                                </article>
                              ))}
                            </div>
                          )}
                        </section>
                      ) : null}

                      {currency.unbudgetedCategories.length > 0 ? (
                        <details className="analytics-filter-shell budget-coverage-shell">
                          <summary className="analytics-filter-summary">
                            <span className="analytics-filter-summary-copy">
                              <span className="analytics-filter-summary-title">
                                Budget coverage is incomplete
                              </span>
                              <span className="analytics-filter-summary-detail">
                                These categories were used this month without a
                                matching budget yet.
                              </span>
                            </span>
                            <span className="analytics-filter-summary-meta">
                              <span className="analytics-filter-summary-status">
                                {formatSensitiveCurrency(
                                  currency.unbudgetedExpenseTotal,
                                  currency.currency,
                                  shouldHideMoney,
                                )}{" "}
                                · {uncoveredCategoryCount} categor
                                {uncoveredCategoryCount === 1 ? "y" : "ies"}
                              </span>
                              <span
                                className="analytics-filter-summary-chevron"
                                aria-hidden="true"
                              />
                            </span>
                          </summary>

                          <div className="budget-coverage-details">
                            {groupRowsByPrimary(
                              currency.unbudgetedCategories,
                              (item) => item.categoryName,
                            ).map((group) => (
                              <div
                                key={group.key}
                                className="section-stack-tight budget-coverage-group"
                              >
                                <h5 className="budget-coverage-group-title">
                                  {group.label}
                                </h5>

                                <div className="budget-coverage-entry-list">
                                  {group.items.map((item) => (
                                    <div
                                      key={item.categoryId}
                                      className="budget-coverage-entry"
                                    >
                                      <div className="budget-coverage-entry-main">
                                        <div className="budget-coverage-entry-head">
                                          <p className="budget-coverage-entry-name">
                                            {item.secondaryCategoryName ??
                                              item.categoryName}
                                          </p>
                                          <span className="status-chip is-info">
                                            {formatSensitiveCurrency(
                                              item.spentAmount,
                                              item.currency,
                                              shouldHideMoney,
                                            )}
                                          </span>
                                          <div className="budget-coverage-entry-actions">
                                            <Link
                                              href={buildBudgetTransactionsLink(
                                                {
                                                  month: budgetView.month,
                                                  primaryCategoryId:
                                                    item.primaryCategoryId,
                                                  secondaryCategoryId:
                                                    item.secondaryCategoryId ??
                                                    item.categoryId,
                                                },
                                              )}
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
                                        <div className="budget-coverage-entry-history">
                                          <span>
                                            <strong>Prev</strong>{" "}
                                            {item.previousMonthExpense === null
                                              ? "No history"
                                              : formatSensitiveCurrency(
                                                  item.previousMonthExpense,
                                                  item.currency,
                                                  shouldHideMoney,
                                                )}
                                          </span>
                                          <span>
                                            <strong>3m avg</strong>{" "}
                                            {item.averageExpenseLast3Months ===
                                            null
                                              ? "No history"
                                              : formatSensitiveCurrency(
                                                  item.averageExpenseLast3Months,
                                                  item.currency,
                                                  shouldHideMoney,
                                                )}
                                          </span>
                                        </div>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            ))}
                          </div>
                        </details>
                      ) : null}
                    </>
                  );
                })()}
              </section>
            ))}
          </div>
        )}

        <WorkflowSection
          title="Use this month in context"
          description={`Keep ${budgetView.month} connected to review and trend analysis instead of treating budgets as a standalone page.`}
          className="is-roomy"
          cards={workflowCards}
        />
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
              categories={categories}
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
