"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type {
  AccountResponse,
  CashflowSummaryResponse,
  CategoryResponse,
  TransactionResponse,
} from "@finhance/shared";
import RecurringOccurrenceForm from "@components/RecurringOccurrenceForm";
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
import { CATEGORY_TYPE_LABELS } from "@lib/categories";
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
  initialFilters,
}: {
  transactions: TransactionResponse[];
  cashflow: CashflowSummaryResponse;
  accounts: AccountResponse[];
  categories: CategoryResponse[];
  initialFilters: TransactionPageFilters;
}) {
  const router = useRouter();
  const [filters, setFilters] =
    useState<TransactionPageFilters>(initialFilters);
  const [editingTransactionId, setEditingTransactionId] = useState<
    string | null
  >(null);
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

    if (nextFilters.categoryId) {
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
    <div className="page-shell">
      <section className="page-hero">
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
            }}
            className="btn-primary"
          >
            New transaction
          </button>
        </div>

        <form
          onSubmit={handleFilterSubmit}
          className="filter-grid lg:grid-cols-[repeat(5,minmax(0,1fr))_auto]"
        >
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-[var(--text-secondary)]">
              From
            </label>
            <input
              className="rounded-lg border px-3 py-2"
              type="date"
              value={filters.from}
              onChange={(event) => updateFilter("from", event.target.value)}
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-[var(--text-secondary)]">
              To
            </label>
            <input
              className="rounded-lg border px-3 py-2"
              type="date"
              value={filters.to}
              onChange={(event) => updateFilter("to", event.target.value)}
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-[var(--text-secondary)]">
              Kind
            </label>
            <select
              className="rounded-lg border px-3 py-2"
              value={filters.kind}
              onChange={(event) => updateFilter("kind", event.target.value)}
            >
              <option value="">All kinds</option>
              {Object.entries(TRANSACTION_KIND_LABELS).map(([kind, label]) => (
                <option key={kind} value={kind}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-[var(--text-secondary)]">
              Account
            </label>
            <select
              className="rounded-lg border px-3 py-2"
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

          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-[var(--text-secondary)]">
              Category
            </label>
            <select
              className="rounded-lg border px-3 py-2"
              value={filters.categoryId}
              onChange={(event) =>
                updateFilter("categoryId", event.target.value)
              }
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
            <label className="page-pill">
              <input
                type="checkbox"
                checked={filters.includeArchivedAccounts}
                onChange={(event) =>
                  updateFilter("includeArchivedAccounts", event.target.checked)
                }
              />
              Include archived accounts
            </label>

            <div className="filter-actions">
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
          </div>
        </form>
      </section>

      <section className="page-split xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,420px)]">
        <div className="space-y-6">
          {cashflow.length === 0 ? (
            <div className="page-inline-notice surface-dashed">
              No cashflow matches the current filters.
            </div>
          ) : (
            cashflow.map((bucket) => (
              <article key={bucket.currency} className="page-section">
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

                <div className="summary-grid mt-5 sm:grid-cols-2 xl:grid-cols-5">
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

                <div className="mt-6 grid gap-6 lg:grid-cols-2">
                  <div>
                    <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                      By category
                    </h3>
                    {bucket.byCategory.length === 0 ? (
                      <p className="mt-2 text-sm text-[var(--text-secondary)]">
                        No income or expense categories in this bucket.
                      </p>
                    ) : (
                      <div className="mt-2 space-y-2">
                        {bucket.byCategory.map((item) => (
                          <div
                            key={`${item.type}:${item.categoryId ?? "uncategorized"}`}
                            className="list-card is-muted flex items-center justify-between text-sm"
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

                  <div>
                    <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                      By account
                    </h3>
                    {bucket.byAccount.length === 0 ? (
                      <p className="mt-2 text-sm text-[var(--text-secondary)]">
                        No account totals in this bucket.
                      </p>
                    ) : (
                      <div className="mt-2 space-y-2">
                        {bucket.byAccount.map((item) => (
                          <div
                            key={item.accountId}
                            className="list-card is-muted text-sm"
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

          <section className="page-section">
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
              <p role="alert" className="mt-4 text-sm text-red-600">
                {deleteError}
              </p>
            ) : null}

            {recurringActionError ? (
              <p role="alert" className="mt-4 text-sm text-red-600">
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
                      <th className="pb-3 pr-4 font-medium">Category</th>
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
                            {category ? category.name : "-"}
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
                                            ruleId:
                                              transaction.recurringRuleId!,
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
        </div>

        <aside className="page-form-card">
          <h2 className="text-xl font-semibold text-[var(--text-primary)]">
            {occurrenceDraft
              ? "Override recurring month"
              : editingTransaction
                ? "Edit transaction"
                : "Create transaction"}
          </h2>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            {occurrenceDraft
              ? "Override one generated occurrence without detaching it from the recurring rule."
              : editingTransaction
                ? editingTransaction.isRecurringGenerated
                  ? "Generated recurring transactions are read-only in v1."
                  : "Adjust cashflow data without affecting your holdings."
                : "Create a new cashflow entry or transfer."}
          </p>

          <div className="mt-6">
            {occurrenceDraft ? (
              <RecurringOccurrenceForm
                ruleId={occurrenceDraft.ruleId}
                accounts={accounts}
                categories={categories}
                initialValues={occurrenceDraft.initialValues}
                onSuccess={() => setOccurrenceDraft(null)}
                onCancel={() => setOccurrenceDraft(null)}
              />
            ) : editingTransaction?.isRecurringGenerated ? (
              <div className="page-inline-notice">
                This transaction was generated by a recurring rule. Update or
                disable the rule from the Recurring page instead.
              </div>
            ) : (
              <TransactionForm
                mode={editingTransaction ? "edit" : "create"}
                transactionId={editingTransaction?.id}
                editingTransaction={editingTransaction}
                accounts={accounts}
                categories={categories}
                initialValues={
                  editingTransaction
                    ? transactionToFormValues(editingTransaction)
                    : createEmptyTransactionFormValues()
                }
                onSuccess={() => setEditingTransactionId(null)}
                onCancel={
                  editingTransaction
                    ? () => setEditingTransactionId(null)
                    : undefined
                }
              />
            )}
          </div>
        </aside>
      </section>
    </div>
  );
}
