"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type {
  AccountResponse,
  CashflowAnalyticsBreakdownItemResponse,
  CashflowSummaryResponse,
  CategoryResponse,
  ExpenseValidationRuleResponse,
  RecurringPendingStatusResponse,
  TransactionResponse,
} from "@finhance/shared";
import AnalyticsCategoryBarChart from "@components/AnalyticsCategoryBarChart";
import Modal from "@components/Modal";
import RecurringOccurrenceForm from "@components/RecurringOccurrenceForm";
import RecurringMaterializeButton from "@components/RecurringMaterializeButton";
import { useAppPreferences } from "@components/ThemeProvider";
import TransactionForm from "@components/TransactionForm";
import type { ActivityFilters } from "@lib/activity";
import { getDefaultActivityFilters } from "@lib/activity";
import { buildTransactionsLink } from "@lib/analytics";
import {
  recurringTransactionToOccurrenceFormValues,
  type RecurringOccurrenceFormValues,
} from "@lib/recurring-occurrence-form";
import {
  createEmptyTransactionFormValues,
  transactionToFormValues,
} from "@lib/transaction-form";
import { apiMutation } from "@lib/api";
import { formatSensitiveCurrency } from "@lib/money";
import { formatCategoryName } from "@lib/categories";
import {
  expensePrimaryCategories,
  expenseSecondaryCategories,
  incomeCategories,
} from "@lib/hierarchical-categories";
import {
  TRANSACTION_KIND_LABELS,
  formatTransactionAmount,
} from "@lib/transactions";
import {
  useSingleFlightActions,
  useSingleFlightNavigation,
} from "@lib/single-flight";
import { api } from "@lib/api";

const DATETIME_FORMATTER = new Intl.DateTimeFormat("it-IT", {
  dateStyle: "medium",
  timeStyle: "short",
});
const DATE_FORMATTER = new Intl.DateTimeFormat("it-IT", {
  dateStyle: "medium",
});

const ENTRY_MONTH_KEY_FORMATTER = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Rome",
  year: "numeric",
  month: "2-digit",
});

const ENTRY_MONTH_LABEL_FORMATTER = new Intl.DateTimeFormat("en-US", {
  timeZone: "Europe/Rome",
  month: "long",
  year: "numeric",
});

interface ExpenseSecondarySummary {
  key: string;
  label: string;
  total: number;
}

interface ExpensePrimarySummary {
  key: string;
  label: string;
  total: number;
  secondaries: ExpenseSecondarySummary[];
}

interface AccountCashflowSummary {
  key: string;
  label: string;
  inflowTotal: number;
  outflowTotal: number;
  netCashflow: number;
}

interface EntryMonthGroup {
  key: string;
  label: string;
  items: TransactionResponse[];
}

function getEntryMonthKey(postedAt: string): string {
  return ENTRY_MONTH_KEY_FORMATTER.format(new Date(postedAt));
}

function getEntryMonthLabel(postedAt: string): string {
  const formatted = ENTRY_MONTH_LABEL_FORMATTER.format(new Date(postedAt));
  return formatted.slice(0, 1).toUpperCase() + formatted.slice(1);
}

function formatSecondaryCount(count: number): string {
  return count === 1 ? "1 secondary category" : `${count} secondary categories`;
}

function buildExpensePrimarySummaries(
  bucket: CashflowSummaryResponse[number],
): ExpensePrimarySummary[] {
  const groups = new Map<
    string,
    {
      label: string;
      total: number;
      secondaries: Map<string, ExpenseSecondarySummary>;
    }
  >();

  for (const item of bucket.byCategory) {
    if (item.type !== "EXPENSE") {
      continue;
    }

    const primaryKey = item.primaryCategoryId ?? item.categoryId ?? item.name;
    const primaryLabel = item.primaryCategoryName ?? item.name;
    const group = groups.get(primaryKey) ?? {
      label: primaryLabel,
      total: 0,
      secondaries: new Map<string, ExpenseSecondarySummary>(),
    };

    group.total += item.total;

    if (item.secondaryCategoryId || item.secondaryCategoryName) {
      const secondaryKey =
        item.secondaryCategoryId ?? item.categoryId ?? item.name;
      const existingSecondary = group.secondaries.get(secondaryKey);

      if (existingSecondary) {
        existingSecondary.total += item.total;
      } else {
        group.secondaries.set(secondaryKey, {
          key: secondaryKey,
          label: item.secondaryCategoryName ?? item.name,
          total: item.total,
        });
      }
    }

    groups.set(primaryKey, group);
  }

  return [...groups.entries()]
    .map(([key, value]) => ({
      key,
      label: value.label,
      total: value.total,
      secondaries: [...value.secondaries.values()].sort(
        (left, right) =>
          right.total - left.total || left.label.localeCompare(right.label),
      ),
    }))
    .sort(
      (left, right) =>
        right.total - left.total || left.label.localeCompare(right.label),
    );
}

function buildExpensePrimaryChartData(
  groups: ExpensePrimarySummary[],
): Array<CashflowAnalyticsBreakdownItemResponse & { selectionKey?: string }> {
  const topGroups: Array<
    CashflowAnalyticsBreakdownItemResponse & { selectionKey?: string }
  > = groups.slice(0, 8).map((group) => ({
    categoryId: group.key,
    name: group.label,
    primaryCategoryId: group.key,
    primaryCategoryName: group.label,
    secondaryCategoryId: null,
    secondaryCategoryName: null,
    total: group.total,
    selectionKey: group.key,
  }));

  const otherTotal = groups
    .slice(8)
    .reduce((sum, group) => sum + group.total, 0);

  if (otherTotal > 0) {
    topGroups.push({
      categoryId: "other",
      name: "Other",
      primaryCategoryId: "other",
      primaryCategoryName: "Other",
      secondaryCategoryId: null,
      secondaryCategoryName: null,
      total: otherTotal,
    });
  }

  return topGroups;
}

function buildAccountCashflowSummaries(
  bucket: CashflowSummaryResponse[number],
): AccountCashflowSummary[] {
  return [...bucket.byAccount]
    .map((item) => ({
      key: item.accountId,
      label: item.name,
      inflowTotal: item.inflowTotal,
      outflowTotal: item.outflowTotal,
      netCashflow: item.netCashflow,
    }))
    .sort(
      (left, right) =>
        Math.abs(right.netCashflow) - Math.abs(left.netCashflow) ||
        left.label.localeCompare(right.label),
    );
}

function groupTransactionsByMonth(
  transactions: TransactionResponse[],
): EntryMonthGroup[] {
  const groups = new Map<string, EntryMonthGroup>();

  for (const transaction of transactions) {
    const key = getEntryMonthKey(transaction.postedAt);
    const existing = groups.get(key);

    if (existing) {
      existing.items.push(transaction);
      continue;
    }

    groups.set(key, {
      key,
      label: getEntryMonthLabel(transaction.postedAt),
      items: [transaction],
    });
  }

  return [...groups.values()].sort((left, right) =>
    right.key.localeCompare(left.key),
  );
}

export default function TransactionsPageClient({
  transactions,
  cashflow,
  accounts,
  categories,
  expenseValidationRules,
  initialFilters,
  initialHasPendingSync = false,
  showTransactionTimes,
}: {
  transactions: TransactionResponse[];
  cashflow: CashflowSummaryResponse;
  accounts: AccountResponse[];
  categories: CategoryResponse[];
  expenseValidationRules: ExpenseValidationRuleResponse[];
  initialFilters: ActivityFilters;
  initialHasPendingSync?: boolean;
  showTransactionTimes: boolean;
}) {
  const router = useRouter();
  const [filters, setFilters] = useState<ActivityFilters>(initialFilters);
  const [editingTransactionId, setEditingTransactionId] = useState<
    string | null
  >(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [recurringActionError, setRecurringActionError] = useState<
    string | null
  >(null);
  const [deletingTransactionId, setDeletingTransactionId] = useState<
    string | null
  >(null);
  const [busyRecurringTransactionId, setBusyRecurringTransactionId] = useState<
    string | null
  >(null);
  const [occurrenceDraft, setOccurrenceDraft] = useState<{
    ruleId: string;
    transactionId: string;
    initialValues: RecurringOccurrenceFormValues;
  } | null>(null);
  const [openEntryMonthKey, setOpenEntryMonthKey] = useState<string | null>(
    null,
  );
  const [hasPendingSync, setHasPendingSync] = useState(initialHasPendingSync);
  const [
    selectedCashflowPrimaryByCurrency,
    setSelectedCashflowPrimaryByCurrency,
  ] = useState<Record<string, string | null>>({});
  const [
    selectedCashflowAccountByCurrency,
    setSelectedCashflowAccountByCurrency,
  ] = useState<Record<string, string | null>>({});
  const actions = useSingleFlightActions<string>();
  const navigation = useSingleFlightNavigation();
  const { hideMoney, isHydrated } = useAppPreferences();
  const shouldHideMoney = !isHydrated || hideMoney;
  const defaultFilters = useMemo(() => getDefaultActivityFilters(), []);
  const hasActiveFilters =
    filters.from !== defaultFilters.from ||
    filters.to !== defaultFilters.to ||
    Boolean(filters.kind) ||
    Boolean(filters.accountId) ||
    Boolean(filters.primaryCategoryId) ||
    Boolean(filters.secondaryCategoryId || filters.categoryId) ||
    filters.includeArchivedAccounts;
  const activeFilterCount = [
    filters.from !== defaultFilters.from,
    filters.to !== defaultFilters.to,
    Boolean(filters.kind),
    Boolean(filters.accountId),
    Boolean(filters.primaryCategoryId),
    Boolean(filters.secondaryCategoryId || filters.categoryId),
    filters.includeArchivedAccounts,
  ].filter(Boolean).length;

  useEffect(() => {
    setFilters(initialFilters);
  }, [initialFilters]);

  useEffect(() => {
    setHasPendingSync(initialHasPendingSync);
  }, [initialHasPendingSync]);

  useEffect(() => {
    let isCancelled = false;

    void api<RecurringPendingStatusResponse>("/recurring-rules/has-pending")
      .then((result) => {
        if (!isCancelled) {
          setHasPendingSync(result.hasPending);
        }
      })
      .catch(() => {
        if (!isCancelled) {
          setHasPendingSync(false);
        }
      });

    return () => {
      isCancelled = true;
    };
  }, []);

  const accountsById = useMemo(
    () => new Map(accounts.map((account) => [account.id, account])),
    [accounts],
  );
  const categoriesById = useMemo(
    () => new Map(categories.map((category) => [category.id, category])),
    [categories],
  );
  const visibleExpensePrimaries = useMemo(
    () => expensePrimaryCategories(categories, filters.primaryCategoryId),
    [categories, filters.primaryCategoryId],
  );
  const visibleSecondaryCategories = useMemo(() => {
    if (filters.primaryCategoryId) {
      return expenseSecondaryCategories(
        categories,
        filters.primaryCategoryId,
        filters.secondaryCategoryId,
      );
    }

    return [
      ...incomeCategories(categories, filters.secondaryCategoryId),
      ...categories.filter(
        (category) =>
          category.type === "EXPENSE" &&
          category.isSecondary &&
          (category.archivedAt === null ||
            category.id === filters.secondaryCategoryId),
      ),
    ];
  }, [categories, filters.primaryCategoryId, filters.secondaryCategoryId]);
  const editingTransaction =
    transactions.find(
      (transaction) => transaction.id === editingTransactionId,
    ) ?? null;
  const currentFilterTarget = useMemo(() => {
    const queryString = buildQueryString(initialFilters);
    return queryString ? `/transactions?${queryString}` : "/transactions";
  }, [initialFilters]);
  const defaultFilterTarget = useMemo(() => {
    const queryString = buildQueryString(defaultFilters);
    return queryString ? `/transactions?${queryString}` : "/transactions";
  }, [defaultFilters]);
  const cashflowExpenseGroups = useMemo(
    () =>
      cashflow.map((bucket) => ({
        currency: bucket.currency,
        groups: buildExpensePrimarySummaries(bucket),
      })),
    [cashflow],
  );
  const cashflowAccountGroups = useMemo(
    () =>
      cashflow.map((bucket) => ({
        currency: bucket.currency,
        accounts: buildAccountCashflowSummaries(bucket),
      })),
    [cashflow],
  );
  const entryMonthGroups = useMemo(
    () => groupTransactionsByMonth(transactions),
    [transactions],
  );

  useEffect(() => {
    setOpenEntryMonthKey(entryMonthGroups[0]?.key ?? null);
  }, [entryMonthGroups]);

  useEffect(() => {
    const validCurrencies = new Set(cashflow.map((bucket) => bucket.currency));

    setSelectedCashflowPrimaryByCurrency((previous) =>
      Object.fromEntries(
        Object.entries(previous).filter(([currency]) =>
          validCurrencies.has(currency),
        ),
      ),
    );
    setSelectedCashflowAccountByCurrency((previous) =>
      Object.fromEntries(
        Object.entries(previous).filter(([currency]) =>
          validCurrencies.has(currency),
        ),
      ),
    );
  }, [cashflow]);

  function updateFilter<Field extends keyof ActivityFilters>(
    field: Field,
    value: ActivityFilters[Field],
  ) {
    setFilters((previous) => ({
      ...previous,
      [field]: value,
    }));
  }

  function buildQueryString(nextFilters: ActivityFilters) {
    const params = new URLSearchParams();

    if (nextFilters.from) {
      params.set("from", nextFilters.from);
    }

    if (nextFilters.to) {
      params.set("to", nextFilters.to);
    }

    if (nextFilters.accountId) {
      params.set("accountId", nextFilters.accountId);
    }

    if (nextFilters.primaryCategoryId) {
      params.set("primaryCategoryId", nextFilters.primaryCategoryId);
    }

    if (nextFilters.secondaryCategoryId) {
      params.set("secondaryCategoryId", nextFilters.secondaryCategoryId);
    } else if (nextFilters.categoryId) {
      params.set("categoryId", nextFilters.categoryId);
    }

    if (nextFilters.kind) {
      params.set("kind", nextFilters.kind);
    }

    if (nextFilters.includeArchivedAccounts) {
      params.set("includeArchivedAccounts", "true");
    }

    return params.toString();
  }

  function handleFilterSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const queryString = buildQueryString(filters);
    const target = queryString
      ? `/transactions?${queryString}`
      : "/transactions";

    if (target === currentFilterTarget) {
      return;
    }

    navigation.run(() => {
      router.push(target);
    });
  }

  function handleClearFilters() {
    const cleared = defaultFilters;

    setFilters(cleared);
    if (currentFilterTarget === defaultFilterTarget) {
      return;
    }

    navigation.run(() => {
      router.push(defaultFilterTarget);
    });
  }

  function toggleCashflowPrimarySelection(currency: string, key: string) {
    setSelectedCashflowPrimaryByCurrency((previous) => ({
      ...previous,
      [currency]: previous[currency] === key ? null : key,
    }));
  }

  function toggleCashflowAccountSelection(currency: string, key: string) {
    setSelectedCashflowAccountByCurrency((previous) => ({
      ...previous,
      [currency]: previous[currency] === key ? null : key,
    }));
  }

  async function handleDelete(transactionId: string) {
    await actions.run(`delete:${transactionId}`, async () => {
      setDeleteError(null);
      setRecurringActionError(null);
      setDeletingTransactionId(transactionId);

      try {
        await apiMutation<void>(`/transactions/${transactionId}`, {
          method: "DELETE",
        });

        if (editingTransactionId === transactionId) {
          setEditingTransactionId(null);
        }

        router.refresh();
      } catch (error) {
        setDeleteError(
          error instanceof Error
            ? error.message
            : "Unable to delete this transaction.",
        );
      } finally {
        setDeletingTransactionId(null);
      }
    });
  }

  async function handleSkipMonth(transaction: TransactionResponse) {
    await actions.run(`skip:${transaction.id}`, async () => {
      if (
        !transaction.recurringRuleId ||
        !transaction.recurringOccurrenceMonth
      ) {
        setRecurringActionError("This recurring occurrence cannot be skipped.");
        return;
      }

      setDeleteError(null);
      setRecurringActionError(null);
      setBusyRecurringTransactionId(transaction.id);

      try {
        await apiMutation(
          `/recurring-rules/${transaction.recurringRuleId}/occurrences/${transaction.recurringOccurrenceMonth.slice(0, 7)}`,
          {
            method: "PUT",
            body: JSON.stringify({ status: "SKIPPED" }),
          },
        );

        if (occurrenceDraft?.transactionId === transaction.id) {
          setOccurrenceDraft(null);
        }

        router.refresh();
      } catch (error) {
        setRecurringActionError(
          error instanceof Error ? error.message : "Unable to skip this month.",
        );
      } finally {
        setBusyRecurringTransactionId(null);
      }
    });
  }

  return (
    <div className="page-shell is-relaxed">
      <section className="page-hero">
        <div className="section-stack-desktop-xl">
          <div className="page-hero-row">
            <div className="page-hero-copy">
              <p className="page-kicker">Cashflow</p>
              <h1 className="page-title is-compact">Transactions</h1>
              <p className="page-description">
                Cashflow history stays separate from portfolio holdings and is
                summarized per currency.
              </p>
            </div>

            <button
              type="button"
              onClick={() => {
                setOccurrenceDraft(null);
                setEditingTransactionId(null);
                setIsCreateModalOpen(true);
              }}
              className="btn-primary"
            >
              New transaction
            </button>
          </div>

          <details className="analytics-filter-shell">
            <summary className="analytics-filter-summary">
              <span className="analytics-filter-summary-copy">
                <span className="analytics-filter-summary-title">Filter</span>
                <span className="analytics-filter-summary-detail">
                  Date range, kind, account, category, and archived-wallet
                  scope.
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

            <form
              onSubmit={handleFilterSubmit}
              className="filter-grid is-relaxed transaction-filter-grid"
            >
              <div className="app-form-field">
                <label>From</label>
                <input
                  type="date"
                  value={filters.from}
                  onChange={(event) => updateFilter("from", event.target.value)}
                />
              </div>

              <div className="app-form-field">
                <label>To</label>
                <input
                  type="date"
                  value={filters.to}
                  onChange={(event) => updateFilter("to", event.target.value)}
                />
              </div>

              <div className="app-form-field">
                <label>Kind</label>
                <select
                  value={filters.kind}
                  onChange={(event) => updateFilter("kind", event.target.value)}
                >
                  <option value="">All</option>
                  {Object.entries(TRANSACTION_KIND_LABELS).map(
                    ([kind, label]) => (
                      <option key={kind} value={kind}>
                        {label}
                      </option>
                    ),
                  )}
                </select>
              </div>

              <div className="app-form-field">
                <label>Account</label>
                <select
                  value={filters.accountId}
                  onChange={(event) =>
                    updateFilter("accountId", event.target.value)
                  }
                >
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
                  value={filters.primaryCategoryId}
                  onChange={(event) =>
                    setFilters((previous) => ({
                      ...previous,
                      categoryId: "",
                      primaryCategoryId: event.target.value,
                      secondaryCategoryId: "",
                    }))
                  }
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
                  value={filters.secondaryCategoryId}
                  onChange={(event) =>
                    setFilters((previous) => ({
                      ...previous,
                      categoryId: "",
                      secondaryCategoryId: event.target.value,
                    }))
                  }
                >
                  <option value="">All</option>
                  {visibleSecondaryCategories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {formatCategoryName(category)}
                    </option>
                  ))}
                </select>
              </div>

              <label className="page-pill transaction-toggle-pill">
                <input
                  type="checkbox"
                  checked={filters.includeArchivedAccounts}
                  onChange={(event) =>
                    updateFilter(
                      "includeArchivedAccounts",
                      event.target.checked,
                    )
                  }
                />
                Archived accounts
              </label>

              <div className="filter-actions is-equal transaction-filter-actions">
                <button
                  type="submit"
                  disabled={navigation.isRunning}
                  className="btn-primary"
                >
                  {navigation.isRunning ? "Applying..." : "Apply"}
                </button>
                <button
                  type="button"
                  onClick={handleClearFilters}
                  disabled={navigation.isRunning}
                  className="btn-secondary"
                >
                  Clear
                </button>
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
                    There are recurring transactions due that haven&apos;t been
                    added to the ledger yet. Sync to include them in the
                    cashflow below.
                  </p>
                </div>
                <RecurringMaterializeButton />
              </div>
            </div>
          ) : null}
        </div>
      </section>

      <section className="route-stack-desktop-xl">
        {cashflow.length === 0 ? (
          <div className="page-inline-notice surface-dashed">
            No cashflow matches the current filters.
          </div>
        ) : (
          cashflow.map((bucket, index) => (
            <article
              key={bucket.currency}
              className="page-section is-spacious section-stack-desktop-xl"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-xl font-semibold text-[var(--text-primary)]">
                    {bucket.currency} cashflow
                  </h2>
                  <p className="mt-1 text-sm text-[var(--text-secondary)]">
                    Income, expense, and adjustments without transfer double
                    counting.
                  </p>
                </div>

                <div className="page-pill">
                  Net{" "}
                  {formatSensitiveCurrency(
                    bucket.netCashflow,
                    bucket.currency,
                    shouldHideMoney,
                  )}
                </div>
              </div>

              <div className="summary-grid is-loose mt-5 sm:grid-cols-2 xl:grid-cols-5">
                <div className="summary-card">
                  <p className="summary-card-label">Income</p>
                  <p className="summary-card-value">
                    {formatSensitiveCurrency(
                      bucket.incomeTotal,
                      bucket.currency,
                      shouldHideMoney,
                    )}
                  </p>
                </div>
                <div className="summary-card">
                  <p className="summary-card-label">Expenses</p>
                  <p className="summary-card-value">
                    {formatSensitiveCurrency(
                      bucket.expenseTotal,
                      bucket.currency,
                      shouldHideMoney,
                    )}
                  </p>
                </div>
                <div className="summary-card">
                  <p className="summary-card-label">Adjustment In</p>
                  <p className="summary-card-value">
                    {formatSensitiveCurrency(
                      bucket.adjustmentInTotal,
                      bucket.currency,
                      shouldHideMoney,
                    )}
                  </p>
                </div>
                <div className="summary-card">
                  <p className="summary-card-label">Adjustment Out</p>
                  <p className="summary-card-value">
                    {formatSensitiveCurrency(
                      bucket.adjustmentOutTotal,
                      bucket.currency,
                      shouldHideMoney,
                    )}
                  </p>
                </div>
                <div className="summary-card">
                  <p className="summary-card-label">Net</p>
                  <p className="summary-card-value">
                    {formatSensitiveCurrency(
                      bucket.netCashflow,
                      bucket.currency,
                      shouldHideMoney,
                    )}
                  </p>
                </div>
              </div>

              <div className="activity-cashflow-grid">
                <div className="section-stack-tight activity-cashflow-column">
                  <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                    By account
                  </h3>
                  <p className="activity-cashflow-chart-copy text-sm text-[var(--text-secondary)]">
                    Select an account row for totals and ledger drill-down.
                  </p>
                  {cashflowAccountGroups[index]?.accounts.length === 0 ? (
                    <p className="mt-2 text-sm text-[var(--text-secondary)]">
                      No account totals in this bucket.
                    </p>
                  ) : (
                    <div className="section-stack-tight activity-cashflow-chart-stack">
                      <div className="detail-panel activity-category-chart-panel">
                        <AnalyticsCategoryBarChart
                          currency={bucket.currency}
                          data={cashflowAccountGroups[index].accounts.map(
                            (item) => ({
                              name: item.label,
                              total: item.netCashflow,
                              selectionKey: item.key,
                            }),
                          )}
                          mode="breakdown"
                          tone="neutral"
                          selectedKey={
                            selectedCashflowAccountByCurrency[
                              bucket.currency
                            ] ?? null
                          }
                          onBarSelect={(key) =>
                            toggleCashflowAccountSelection(bucket.currency, key)
                          }
                        />
                      </div>

                      {(() => {
                        const selectedAccountKey =
                          selectedCashflowAccountByCurrency[bucket.currency] ??
                          null;
                        const selectedAccount =
                          cashflowAccountGroups[index].accounts.find(
                            (item) => item.key === selectedAccountKey,
                          ) ?? null;

                        if (!selectedAccount) {
                          return null;
                        }

                        return (
                          <div className="detail-panel is-roomy section-stack-tight activity-cashflow-detail-panel">
                            <div className="activity-category-group-header">
                              <div className="activity-category-group-copy">
                                <p className="font-medium text-[var(--text-primary)]">
                                  {selectedAccount.label}
                                </p>
                                <p className="text-sm text-[var(--text-secondary)]">
                                  Net cashflow for this account in the selected
                                  range.
                                </p>
                              </div>
                              <span className="font-medium text-[var(--text-primary)]">
                                {formatSensitiveCurrency(
                                  selectedAccount.netCashflow,
                                  bucket.currency,
                                  shouldHideMoney,
                                )}
                              </span>
                            </div>

                            <div className="activity-cashflow-detail-metrics">
                              <div className="activity-cashflow-detail-metric">
                                <span className="activity-cashflow-detail-label">
                                  In
                                </span>
                                <span className="activity-cashflow-detail-value">
                                  {formatSensitiveCurrency(
                                    selectedAccount.inflowTotal,
                                    bucket.currency,
                                    shouldHideMoney,
                                  )}
                                </span>
                              </div>
                              <div className="activity-cashflow-detail-metric">
                                <span className="activity-cashflow-detail-label">
                                  Out
                                </span>
                                <span className="activity-cashflow-detail-value">
                                  {formatSensitiveCurrency(
                                    selectedAccount.outflowTotal,
                                    bucket.currency,
                                    shouldHideMoney,
                                  )}
                                </span>
                              </div>
                            </div>

                            <div className="activity-cashflow-detail-actions">
                              <button
                                type="button"
                                className="btn-secondary"
                                onClick={() =>
                                  navigation.run(() => {
                                    router.push(
                                      buildTransactionsLink({
                                        ...initialFilters,
                                        accountId: selectedAccount.key,
                                      }),
                                    );
                                  })
                                }
                              >
                                Open in Activity
                              </button>
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  )}
                </div>

                <div className="section-stack-tight activity-cashflow-column">
                  <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                    By category
                  </h3>
                  <p className="activity-cashflow-chart-copy text-sm text-[var(--text-secondary)]">
                    Select a category row for breakdown and ledger drill-down.
                  </p>
                  {cashflowExpenseGroups[index]?.groups.length === 0 ? (
                    <p className="mt-2 text-sm text-[var(--text-secondary)]">
                      No expense categories in this bucket.
                    </p>
                  ) : (
                    <div className="section-stack-tight activity-cashflow-chart-stack">
                      <div className="detail-panel activity-category-chart-panel">
                        <AnalyticsCategoryBarChart
                          currency={bucket.currency}
                          data={buildExpensePrimaryChartData(
                            cashflowExpenseGroups[index].groups,
                          )}
                          mode="breakdown"
                          selectedKey={
                            selectedCashflowPrimaryByCurrency[
                              bucket.currency
                            ] ?? null
                          }
                          onBarSelect={(key) => {
                            if (key === "other") {
                              return;
                            }

                            toggleCashflowPrimarySelection(
                              bucket.currency,
                              key,
                            );
                          }}
                        />
                      </div>

                      {(() => {
                        const selectedPrimaryKey =
                          selectedCashflowPrimaryByCurrency[bucket.currency] ??
                          null;
                        const selectedPrimary =
                          cashflowExpenseGroups[index].groups.find(
                            (group) => group.key === selectedPrimaryKey,
                          ) ?? null;

                        if (!selectedPrimary) {
                          return null;
                        }

                        return (
                          <div className="detail-panel is-roomy section-stack-tight activity-cashflow-detail-panel">
                            <div className="activity-category-group-header">
                              <div className="activity-category-group-copy">
                                <p className="font-medium text-[var(--text-primary)]">
                                  {selectedPrimary.label}
                                </p>
                                <p className="text-sm text-[var(--text-secondary)]">
                                  {formatSecondaryCount(
                                    selectedPrimary.secondaries.length,
                                  )}
                                </p>
                              </div>
                              <span className="font-medium text-[var(--text-primary)]">
                                {formatSensitiveCurrency(
                                  selectedPrimary.total,
                                  bucket.currency,
                                  shouldHideMoney,
                                )}
                              </span>
                            </div>

                            {selectedPrimary.secondaries.length > 0 ? (
                              <div className="activity-category-secondary-list">
                                {selectedPrimary.secondaries.map(
                                  (secondary) => (
                                    <div
                                      key={secondary.key}
                                      className="activity-category-secondary-row"
                                    >
                                      <p className="text-sm text-[var(--text-secondary)]">
                                        {secondary.label}
                                      </p>
                                      <span className="text-sm font-medium text-[var(--text-primary)]">
                                        {formatSensitiveCurrency(
                                          secondary.total,
                                          bucket.currency,
                                          shouldHideMoney,
                                        )}
                                      </span>
                                    </div>
                                  ),
                                )}
                              </div>
                            ) : (
                              <p className="text-sm text-[var(--text-secondary)]">
                                No secondary categories in this range.
                              </p>
                            )}

                            <div className="activity-cashflow-detail-actions">
                              <button
                                type="button"
                                className="btn-secondary"
                                onClick={() =>
                                  navigation.run(() => {
                                    router.push(
                                      buildTransactionsLink({
                                        ...initialFilters,
                                        primaryCategoryId: selectedPrimary.key,
                                        secondaryCategoryId: null,
                                        categoryId: null,
                                      }),
                                    );
                                  })
                                }
                              >
                                Open in Activity
                              </button>
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  )}
                </div>
              </div>
            </article>
          ))
        )}

        <section className="page-section is-spacious section-stack-spacious">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold text-[var(--text-primary)]">
                Entries
              </h2>
              <p className="mt-1 text-sm text-[var(--text-secondary)]">
                Logical transactions, including paired transfers and
                split-funded expenses.
              </p>
            </div>
          </div>

          {deleteError ? (
            <p role="alert" className="page-inline-notice surface-danger">
              {deleteError}
            </p>
          ) : null}

          {recurringActionError ? (
            <p role="alert" className="page-inline-notice surface-danger">
              {recurringActionError}
            </p>
          ) : null}

          {transactions.length === 0 ? (
            <div className="mt-6 page-inline-notice surface-dashed">
              No transactions match the current filters.
            </div>
          ) : (
            <div className="activity-month-stack">
              {entryMonthGroups.map((group) => {
                const isOpen = openEntryMonthKey === group.key;

                return (
                  <section
                    key={group.key}
                    className="detail-panel is-roomy section-stack-tight"
                  >
                    <button
                      type="button"
                      onClick={() =>
                        setOpenEntryMonthKey((previous) =>
                          previous === group.key ? null : group.key,
                        )
                      }
                      className="activity-month-toggle"
                    >
                      <div className="activity-month-toggle-copy">
                        <h3 className="activity-month-title">{group.label}</h3>
                        <p className="text-sm text-[var(--text-secondary)]">
                          {group.items.length}{" "}
                          {group.items.length === 1 ? "entry" : "entries"}
                        </p>
                      </div>
                      <span className="activity-month-toggle-indicator">
                        {isOpen ? "−" : "+"}
                      </span>
                    </button>

                    {isOpen ? (
                      <div className="table-shell activity-month-table-shell">
                        <table className="data-table">
                          <thead>
                            <tr>
                              <th className="pb-3 pr-4 font-medium">Posted</th>
                              <th className="pb-3 pr-4 font-medium">Kind</th>
                              <th className="pb-3 pr-4 font-medium">
                                Description
                              </th>
                              <th className="pb-3 pr-4 font-medium">
                                Accounts
                              </th>
                              <th className="pb-3 pr-4 font-medium">Primary</th>
                              <th className="pb-3 pr-4 font-medium">
                                Secondary
                              </th>
                              <th className="pb-3 pr-4 font-medium">Amount</th>
                              <th className="pb-3 font-medium">Actions</th>
                            </tr>
                          </thead>
                          <tbody>
                            {group.items.map((transaction) => {
                              const account =
                                transaction.accountId !== null
                                  ? accountsById.get(transaction.accountId)
                                  : null;
                              const sourceAccount =
                                transaction.sourceAccountId !== null
                                  ? accountsById.get(
                                      transaction.sourceAccountId,
                                    )
                                  : null;
                              const destinationAccount =
                                transaction.destinationAccountId !== null
                                  ? accountsById.get(
                                      transaction.destinationAccountId,
                                    )
                                  : null;
                              const category =
                                transaction.categoryId !== null
                                  ? categoriesById.get(transaction.categoryId)
                                  : null;
                              const fundingLegs = transaction.fundingLegs ?? [];
                              const isSplitExpense =
                                transaction.kind === "EXPENSE" &&
                                fundingLegs.length >= 2;

                              return (
                                <tr
                                  key={transaction.id}
                                  className="text-[var(--text-secondary)]"
                                >
                                  <td className="py-3 pr-4 text-[var(--text-primary)]">
                                    {(showTransactionTimes
                                      ? DATETIME_FORMATTER
                                      : DATE_FORMATTER
                                    ).format(new Date(transaction.postedAt))}
                                  </td>
                                  <td className="py-3 pr-4">
                                    <div className="flex flex-wrap items-center gap-2">
                                      <span>
                                        {
                                          TRANSACTION_KIND_LABELS[
                                            transaction.kind
                                          ]
                                        }
                                      </span>
                                      {isSplitExpense ? (
                                        <span className="status-chip is-neutral">
                                          Split
                                        </span>
                                      ) : null}
                                      {transaction.isRecurringGenerated ? (
                                        <span className="status-chip is-neutral">
                                          Recurring
                                        </span>
                                      ) : null}
                                    </div>
                                  </td>
                                  <td className="py-3 pr-4">
                                    <p className="font-medium text-[var(--text-primary)]">
                                      {transaction.description}
                                    </p>
                                    {transaction.counterparty ? (
                                      <p className="text-xs text-[var(--text-secondary)]">
                                        {transaction.counterparty}
                                      </p>
                                    ) : null}
                                  </td>
                                  <td className="py-3 pr-4">
                                    {transaction.kind === "TRANSFER" ? (
                                      <p>
                                        {sourceAccount?.name ??
                                          transaction.sourceAccountId}
                                        {" -> "}
                                        {destinationAccount?.name ??
                                          transaction.destinationAccountId}
                                      </p>
                                    ) : isSplitExpense ? (
                                      <details className="group">
                                        <summary className="cursor-pointer font-medium text-[var(--text-primary)]">
                                          Split across {fundingLegs.length}{" "}
                                          accounts
                                        </summary>
                                        <ul className="mt-2 space-y-1 text-xs text-[var(--text-secondary)]">
                                          {fundingLegs.map((leg) => (
                                            <li
                                              key={`${transaction.id}-${leg.accountId}`}
                                            >
                                              {(accountsById.get(leg.accountId)
                                                ?.name ?? leg.accountId) +
                                                ": " +
                                                formatSensitiveCurrency(
                                                  leg.amount,
                                                  leg.currency,
                                                  shouldHideMoney,
                                                )}
                                            </li>
                                          ))}
                                        </ul>
                                      </details>
                                    ) : (
                                      <p>
                                        {account?.name ?? transaction.accountId}
                                      </p>
                                    )}
                                  </td>
                                  <td className="py-3 pr-4">
                                    {transaction.primaryCategoryName ?? "-"}
                                  </td>
                                  <td className="py-3 pr-4">
                                    {transaction.secondaryCategoryName ??
                                      category?.name ??
                                      "-"}
                                  </td>
                                  <td className="py-3 pr-4 font-medium text-[var(--text-primary)]">
                                    {formatTransactionAmount(
                                      transaction,
                                      (value, currency) =>
                                        formatSensitiveCurrency(
                                          value,
                                          currency,
                                          shouldHideMoney,
                                        ),
                                    )}
                                  </td>
                                  <td className="py-3 transaction-row-actions-cell">
                                    <div className="transaction-row-actions">
                                      {transaction.isRecurringGenerated ? (
                                        <>
                                          <span className="text-xs text-[var(--text-secondary)]">
                                            Locked
                                          </span>
                                          {transaction.recurringRuleId &&
                                          transaction.recurringOccurrenceMonth ? (
                                            <>
                                              <button
                                                type="button"
                                                onClick={() =>
                                                  setOccurrenceDraft({
                                                    ruleId:
                                                      transaction.recurringRuleId!,
                                                    transactionId:
                                                      transaction.id,
                                                    initialValues:
                                                      recurringTransactionToOccurrenceFormValues(
                                                        transaction,
                                                      ),
                                                  })
                                                }
                                                className="link-button mobile-hit-target transaction-row-action"
                                              >
                                                Override month
                                              </button>
                                              <button
                                                type="button"
                                                onClick={() =>
                                                  void handleSkipMonth(
                                                    transaction,
                                                  )
                                                }
                                                disabled={
                                                  busyRecurringTransactionId ===
                                                  transaction.id
                                                }
                                                className="link-button is-warning mobile-hit-target transaction-row-action disabled:cursor-not-allowed disabled:opacity-60"
                                              >
                                                {busyRecurringTransactionId ===
                                                transaction.id
                                                  ? "Skipping..."
                                                  : "Skip month"}
                                              </button>
                                            </>
                                          ) : null}
                                        </>
                                      ) : (
                                        <>
                                          <button
                                            type="button"
                                            onClick={() => {
                                              setOccurrenceDraft(null);
                                              setEditingTransactionId(
                                                transaction.id,
                                              );
                                            }}
                                            className="link-button mobile-hit-target transaction-row-action"
                                          >
                                            Edit
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() =>
                                              void handleDelete(transaction.id)
                                            }
                                            disabled={
                                              deletingTransactionId ===
                                              transaction.id
                                            }
                                            className="link-button is-danger mobile-hit-target transaction-row-action disabled:cursor-not-allowed disabled:opacity-60"
                                          >
                                            {deletingTransactionId ===
                                            transaction.id
                                              ? "Deleting..."
                                              : "Delete"}
                                          </button>
                                        </>
                                      )}
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    ) : null}
                  </section>
                );
              })}
            </div>
          )}
        </section>
      </section>

      <Modal
        open={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        title="Create transaction"
        maxWidth={760}
      >
        <p className="section-subtitle">
          Create a new cashflow entry or transfer.
        </p>
        <div className="mt-6">
          <TransactionForm
            mode="create"
            accounts={accounts}
            categories={categories}
            expenseValidationRules={expenseValidationRules}
            showTransactionTimes={showTransactionTimes}
            initialValues={createEmptyTransactionFormValues(
              showTransactionTimes,
            )}
            onSuccess={() => setIsCreateModalOpen(false)}
            onCancel={() => setIsCreateModalOpen(false)}
          />
        </div>
      </Modal>

      <Modal
        open={editingTransaction !== null}
        onClose={() => setEditingTransactionId(null)}
        title={
          editingTransaction
            ? `Edit ${editingTransaction.description}`
            : "Edit transaction"
        }
        maxWidth={760}
      >
        {editingTransaction ? (
          <>
            <p className="section-subtitle">
              Adjust cashflow data without affecting your holdings.
            </p>
            <div className="mt-6">
              <TransactionForm
                mode="edit"
                transactionId={editingTransaction.id}
                editingTransaction={editingTransaction}
                accounts={accounts}
                categories={categories}
                expenseValidationRules={expenseValidationRules}
                showTransactionTimes={showTransactionTimes}
                initialValues={transactionToFormValues(
                  editingTransaction,
                  showTransactionTimes,
                )}
                onSuccess={() => setEditingTransactionId(null)}
                onCancel={() => setEditingTransactionId(null)}
              />
            </div>
          </>
        ) : null}
      </Modal>

      <Modal
        open={occurrenceDraft !== null}
        onClose={() => setOccurrenceDraft(null)}
        title="Override recurring month"
        maxWidth={760}
      >
        {occurrenceDraft ? (
          <>
            <p className="section-subtitle">
              Override one generated occurrence without detaching it from the
              recurring rule.
            </p>
            <div className="mt-6">
              <RecurringOccurrenceForm
                ruleId={occurrenceDraft.ruleId}
                accounts={accounts}
                categories={categories}
                expenseValidationRules={expenseValidationRules}
                initialValues={occurrenceDraft.initialValues}
                onSuccess={() => setOccurrenceDraft(null)}
                onCancel={() => setOccurrenceDraft(null)}
              />
            </div>
          </>
        ) : null}
      </Modal>
    </div>
  );
}
