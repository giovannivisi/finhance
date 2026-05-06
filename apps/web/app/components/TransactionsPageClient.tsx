"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type {
  AccountResponse,
  CashflowSummaryResponse,
  CategoryResponse,
  ExpenseValidationRuleResponse,
  TransactionResponse,
} from "@finhance/shared";
import Modal from "@components/Modal";
import RecurringOccurrenceForm from "@components/RecurringOccurrenceForm";
import RecurringMaterializeButton from "@components/RecurringMaterializeButton";
import { useAppPreferences } from "@components/ThemeProvider";
import TransactionForm from "@components/TransactionForm";
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
import { CATEGORY_TYPE_LABELS, formatCategoryName } from "@lib/categories";
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

interface TransactionPageFilters {
  from: string;
  to: string;
  accountId: string;
  categoryId: string;
  primaryCategoryId: string;
  secondaryCategoryId: string;
  kind: string;
  includeArchivedAccounts: boolean;
}

const DATETIME_FORMATTER = new Intl.DateTimeFormat("it-IT", {
  dateStyle: "medium",
  timeStyle: "short",
});

export default function TransactionsPageClient({
  transactions,
  cashflow,
  accounts,
  categories,
  expenseValidationRules,
  initialFilters,
}: {
  transactions: TransactionResponse[];
  cashflow: CashflowSummaryResponse;
  accounts: AccountResponse[];
  categories: CategoryResponse[];
  expenseValidationRules: ExpenseValidationRuleResponse[];
  initialFilters: TransactionPageFilters;
}) {
  const router = useRouter();
  const [filters, setFilters] =
    useState<TransactionPageFilters>(initialFilters);
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
  const actions = useSingleFlightActions<string>();
  const navigation = useSingleFlightNavigation();
  const { hideMoney, isHydrated } = useAppPreferences();
  const shouldHideMoney = !isHydrated || hideMoney;

  useEffect(() => {
    setFilters(initialFilters);
  }, [initialFilters]);

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

  function updateFilter<Field extends keyof TransactionPageFilters>(
    field: Field,
    value: TransactionPageFilters[Field],
  ) {
    setFilters((previous) => ({
      ...previous,
      [field]: value,
    }));
  }

  function buildQueryString(nextFilters: TransactionPageFilters) {
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
    const cleared: TransactionPageFilters = {
      from: "",
      to: "",
      accountId: "",
      categoryId: "",
      primaryCategoryId: "",
      secondaryCategoryId: "",
      kind: "",
      includeArchivedAccounts: false,
    };

    setFilters(cleared);
    if (currentFilterTarget === "/transactions") {
      return;
    }

    navigation.run(() => {
      router.push("/transactions");
    });
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
                <option value="">All kinds</option>
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
                value={filters.secondaryCategoryId}
                onChange={(event) =>
                  setFilters((previous) => ({
                    ...previous,
                    categoryId: "",
                    secondaryCategoryId: event.target.value,
                  }))
                }
              >
                <option value="">All secondaries</option>
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
                  updateFilter("includeArchivedAccounts", event.target.checked)
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

          <div className="detail-panel is-roomy">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h2 className="text-sm font-semibold text-[var(--text-primary)]">
                  Recurring sync
                </h2>
                <p className="mt-1 text-sm text-[var(--text-secondary)]">
                  This page no longer creates transactions during render. Sync
                  due transactions when you want the ledger and cashflow below
                  to include any missing recurring entries.
                </p>
              </div>
              <RecurringMaterializeButton />
            </div>
          </div>
        </div>
      </section>

      <section className="route-stack-desktop-xl">
        {cashflow.length === 0 ? (
          <div className="page-inline-notice surface-dashed">
            No cashflow matches the current filters.
          </div>
        ) : (
          cashflow.map((bucket) => (
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

              <div className="mt-6 grid gap-8 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
                <div className="section-stack-tight">
                  <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                    By category
                  </h3>
                  {bucket.byCategory.length === 0 ? (
                    <p className="mt-2 text-sm text-[var(--text-secondary)]">
                      No income or expense categories in this bucket.
                    </p>
                  ) : (
                    <div className="mt-2 subcard-stack is-loose">
                      {bucket.byCategory.map((item) => (
                        <div
                          key={`${item.type}:${item.categoryId ?? "uncategorized"}`}
                          className="detail-panel is-roomy flex items-center justify-between gap-4 text-sm"
                        >
                          <div>
                            <p className="font-medium text-[var(--text-primary)]">
                              {item.name}
                            </p>
                            <p className="text-[var(--text-secondary)]">
                              {CATEGORY_TYPE_LABELS[item.type]}
                            </p>
                          </div>
                          <span className="font-medium text-[var(--text-primary)]">
                            {formatSensitiveCurrency(
                              item.total,
                              bucket.currency,
                              shouldHideMoney,
                            )}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="section-stack-tight">
                  <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                    By account
                  </h3>
                  {bucket.byAccount.length === 0 ? (
                    <p className="mt-2 text-sm text-[var(--text-secondary)]">
                      No account totals in this bucket.
                    </p>
                  ) : (
                    <div className="mt-2 subcard-stack is-loose">
                      {bucket.byAccount.map((item) => (
                        <div
                          key={item.accountId}
                          className="detail-panel is-roomy text-sm"
                        >
                          <div className="flex items-center justify-between gap-3">
                            <p className="font-medium text-[var(--text-primary)]">
                              {item.name}
                            </p>
                            <span className="font-medium text-[var(--text-primary)]">
                              Net{" "}
                              {formatSensitiveCurrency(
                                item.netCashflow,
                                bucket.currency,
                                shouldHideMoney,
                              )}
                            </span>
                          </div>
                          <p className="mt-1 text-[var(--text-secondary)]">
                            In{" "}
                            {formatSensitiveCurrency(
                              item.inflowTotal,
                              bucket.currency,
                              shouldHideMoney,
                            )}
                            {" · "}
                            Out{" "}
                            {formatSensitiveCurrency(
                              item.outflowTotal,
                              bucket.currency,
                              shouldHideMoney,
                            )}
                          </p>
                        </div>
                      ))}
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
                Logical transactions, including paired transfers.
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
            <div className="table-shell">
              <table className="data-table">
                <thead>
                  <tr>
                    <th className="pb-3 pr-4 font-medium">Posted</th>
                    <th className="pb-3 pr-4 font-medium">Kind</th>
                    <th className="pb-3 pr-4 font-medium">Description</th>
                    <th className="pb-3 pr-4 font-medium">Accounts</th>
                    <th className="pb-3 pr-4 font-medium">Primary</th>
                    <th className="pb-3 pr-4 font-medium">Secondary</th>
                    <th className="pb-3 pr-4 font-medium">Amount</th>
                    <th className="pb-3 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.map((transaction) => {
                    const account =
                      transaction.accountId !== null
                        ? accountsById.get(transaction.accountId)
                        : null;
                    const sourceAccount =
                      transaction.sourceAccountId !== null
                        ? accountsById.get(transaction.sourceAccountId)
                        : null;
                    const destinationAccount =
                      transaction.destinationAccountId !== null
                        ? accountsById.get(transaction.destinationAccountId)
                        : null;
                    const category =
                      transaction.categoryId !== null
                        ? categoriesById.get(transaction.categoryId)
                        : null;

                    return (
                      <tr
                        key={transaction.id}
                        className="text-[var(--text-secondary)]"
                      >
                        <td className="py-3 pr-4 text-[var(--text-primary)]">
                          {DATETIME_FORMATTER.format(
                            new Date(transaction.postedAt),
                          )}
                        </td>
                        <td className="py-3 pr-4">
                          <div className="flex flex-wrap items-center gap-2">
                            <span>
                              {TRANSACTION_KIND_LABELS[transaction.kind]}
                            </span>
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
                          ) : (
                            <p>{account?.name ?? transaction.accountId}</p>
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
                        <td className="py-3">
                          <div className="flex items-center gap-3">
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
                                          ruleId: transaction.recurringRuleId!,
                                          transactionId: transaction.id,
                                          initialValues:
                                            recurringTransactionToOccurrenceFormValues(
                                              transaction,
                                            ),
                                        })
                                      }
                                      className="link-button mobile-hit-target"
                                    >
                                      Override month
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        void handleSkipMonth(transaction)
                                      }
                                      disabled={
                                        busyRecurringTransactionId ===
                                        transaction.id
                                      }
                                      className="link-button is-warning mobile-hit-target disabled:cursor-not-allowed disabled:opacity-60"
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
                                    setEditingTransactionId(transaction.id);
                                  }}
                                  className="link-button mobile-hit-target"
                                >
                                  Edit
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    void handleDelete(transaction.id)
                                  }
                                  disabled={
                                    deletingTransactionId === transaction.id
                                  }
                                  className="link-button is-danger mobile-hit-target disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                  {deletingTransactionId === transaction.id
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
            initialValues={createEmptyTransactionFormValues()}
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
                initialValues={transactionToFormValues(editingTransaction)}
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
