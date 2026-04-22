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
import TransactionForm from "@components/TransactionForm";
import {
  recurringTransactionToOccurrenceFormValues,
  type RecurringOccurrenceFormValues,
} from "@lib/recurring-occurrence-form";
import {
  createEmptyTransactionFormValues,
  transactionToFormValues,
} from "@lib/transaction-form";
import { getApiUrl, readApiError } from "@lib/api";
import { formatCurrency } from "@lib/format";
import { CATEGORY_TYPE_LABELS } from "@lib/categories";
import {
  TRANSACTION_KIND_LABELS,
  formatTransactionAmount,
} from "@lib/transactions";

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
    router.push(queryString ? `/transactions?${queryString}` : "/transactions");
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
    router.push("/transactions");
  }

  async function handleDelete(transactionId: string) {
    setDeleteError(null);
    setRecurringActionError(null);
    setDeletingTransactionId(transactionId);

    try {
      const response = await fetch(
        getApiUrl(`/transactions/${transactionId}`),
        {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
        },
      );

      if (!response.ok) {
        setDeleteError(await readApiError(response));
        return;
      }

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
  }

  async function handleSkipMonth(transaction: TransactionResponse) {
    if (!transaction.recurringRuleId || !transaction.recurringOccurrenceMonth) {
      setRecurringActionError("This recurring occurrence cannot be skipped.");
      return;
    }

    setDeleteError(null);
    setRecurringActionError(null);
    setBusyRecurringTransactionId(transaction.id);

    try {
      const response = await fetch(
        getApiUrl(
          `/recurring-rules/${transaction.recurringRuleId}/occurrences/${transaction.recurringOccurrenceMonth.slice(0, 7)}`,
        ),
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "SKIPPED" }),
        },
      );

      if (!response.ok) {
        setRecurringActionError(await readApiError(response));
        return;
      }

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
  }

  return (
    <div className="space-y-8">
      <section className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-gray-100">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-3xl font-semibold text-gray-900">
              Transactions
            </h1>
            <p className="mt-1 text-sm text-gray-500">
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
            className="rounded-lg border px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            New transaction
          </button>
        </div>

        <form
          onSubmit={handleFilterSubmit}
          className="mt-6 grid gap-4 lg:grid-cols-[repeat(5,minmax(0,1fr))_auto]"
        >
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-600">From</label>
            <input
              className="rounded-lg border px-3 py-2"
              type="date"
              value={filters.from}
              onChange={(event) => updateFilter("from", event.target.value)}
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-600">To</label>
            <input
              className="rounded-lg border px-3 py-2"
              type="date"
              value={filters.to}
              onChange={(event) => updateFilter("to", event.target.value)}
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-600">Kind</label>
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
            <label className="text-sm font-medium text-gray-600">Account</label>
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
            <label className="text-sm font-medium text-gray-600">
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
            <label className="flex items-center gap-2 text-sm text-gray-600">
              <input
                type="checkbox"
                checked={filters.includeArchivedAccounts}
                onChange={(event) =>
                  updateFilter("includeArchivedAccounts", event.target.checked)
                }
              />
              Include archived accounts
            </label>

            <div className="flex gap-3">
              <button
                type="submit"
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
              >
                Apply
              </button>
              <button
                type="button"
                onClick={handleClearFilters}
                className="rounded-lg border px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Clear
              </button>
            </div>
          </div>
        </form>
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,420px)]">
        <div className="space-y-6">
          {cashflow.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-gray-300 bg-white p-8 text-sm text-gray-500">
              No cashflow matches the current filters.
            </div>
          ) : (
            cashflow.map((bucket) => (
              <article
                key={bucket.currency}
                className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-gray-100"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="text-xl font-semibold text-gray-900">
                      {bucket.currency} cashflow
                    </h2>
                    <p className="mt-1 text-sm text-gray-500">
                      Income, expense, and adjustments without transfer double
                      counting.
                    </p>
                  </div>

                  <div className="rounded-full bg-gray-100 px-3 py-1 text-sm font-medium text-gray-700">
                    Net {formatCurrency(bucket.netCashflow, bucket.currency)}
                  </div>
                </div>

                <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
                  <div className="rounded-2xl bg-gray-50 p-4">
                    <p className="text-xs uppercase tracking-wide text-gray-500">
                      Income
                    </p>
                    <p className="mt-1 text-lg font-semibold text-gray-900">
                      {formatCurrency(bucket.incomeTotal, bucket.currency)}
                    </p>
                  </div>
                  <div className="rounded-2xl bg-gray-50 p-4">
                    <p className="text-xs uppercase tracking-wide text-gray-500">
                      Expenses
                    </p>
                    <p className="mt-1 text-lg font-semibold text-gray-900">
                      {formatCurrency(bucket.expenseTotal, bucket.currency)}
                    </p>
                  </div>
                  <div className="rounded-2xl bg-gray-50 p-4">
                    <p className="text-xs uppercase tracking-wide text-gray-500">
                      Adjustment In
                    </p>
                    <p className="mt-1 text-lg font-semibold text-gray-900">
                      {formatCurrency(
                        bucket.adjustmentInTotal,
                        bucket.currency,
                      )}
                    </p>
                  </div>
                  <div className="rounded-2xl bg-gray-50 p-4">
                    <p className="text-xs uppercase tracking-wide text-gray-500">
                      Adjustment Out
                    </p>
                    <p className="mt-1 text-lg font-semibold text-gray-900">
                      {formatCurrency(
                        bucket.adjustmentOutTotal,
                        bucket.currency,
                      )}
                    </p>
                  </div>
                  <div className="rounded-2xl bg-gray-50 p-4">
                    <p className="text-xs uppercase tracking-wide text-gray-500">
                      Net
                    </p>
                    <p className="mt-1 text-lg font-semibold text-gray-900">
                      {formatCurrency(bucket.netCashflow, bucket.currency)}
                    </p>
                  </div>
                </div>

                <div className="mt-6 grid gap-6 lg:grid-cols-2">
                  <div>
                    <h3 className="text-sm font-semibold text-gray-900">
                      By category
                    </h3>
                    {bucket.byCategory.length === 0 ? (
                      <p className="mt-2 text-sm text-gray-500">
                        No income or expense categories in this bucket.
                      </p>
                    ) : (
                      <div className="mt-2 space-y-2">
                        {bucket.byCategory.map((item) => (
                          <div
                            key={`${item.type}:${item.categoryId ?? "uncategorized"}`}
                            className="flex items-center justify-between rounded-2xl bg-gray-50 px-4 py-3 text-sm"
                          >
                            <div>
                              <p className="font-medium text-gray-900">
                                {item.name}
                              </p>
                              <p className="text-gray-500">
                                {CATEGORY_TYPE_LABELS[item.type]}
                              </p>
                            </div>
                            <span className="font-medium text-gray-900">
                              {formatCurrency(item.total, bucket.currency)}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div>
                    <h3 className="text-sm font-semibold text-gray-900">
                      By account
                    </h3>
                    {bucket.byAccount.length === 0 ? (
                      <p className="mt-2 text-sm text-gray-500">
                        No account totals in this bucket.
                      </p>
                    ) : (
                      <div className="mt-2 space-y-2">
                        {bucket.byAccount.map((item) => (
                          <div
                            key={item.accountId}
                            className="rounded-2xl bg-gray-50 px-4 py-3 text-sm"
                          >
                            <div className="flex items-center justify-between gap-3">
                              <p className="font-medium text-gray-900">
                                {item.name}
                              </p>
                              <span className="font-medium text-gray-900">
                                Net{" "}
                                {formatCurrency(
                                  item.netCashflow,
                                  bucket.currency,
                                )}
                              </span>
                            </div>
                            <p className="mt-1 text-gray-500">
                              In{" "}
                              {formatCurrency(
                                item.inflowTotal,
                                bucket.currency,
                              )}
                              {" · "}
                              Out{" "}
                              {formatCurrency(
                                item.outflowTotal,
                                bucket.currency,
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

          <section className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-gray-100">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-semibold text-gray-900">Entries</h2>
                <p className="mt-1 text-sm text-gray-500">
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
              <div className="mt-6 rounded-2xl border border-dashed border-gray-300 bg-white p-6 text-sm text-gray-500">
                No transactions match the current filters.
              </div>
            ) : (
              <div className="mt-6 overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 text-sm">
                  <thead>
                    <tr className="text-left text-gray-500">
                      <th className="pb-3 pr-4 font-medium">Posted</th>
                      <th className="pb-3 pr-4 font-medium">Kind</th>
                      <th className="pb-3 pr-4 font-medium">Description</th>
                      <th className="pb-3 pr-4 font-medium">Accounts</th>
                      <th className="pb-3 pr-4 font-medium">Category</th>
                      <th className="pb-3 pr-4 font-medium">Amount</th>
                      <th className="pb-3 font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
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
                        <tr key={transaction.id} className="text-gray-700">
                          <td className="py-3 pr-4 text-gray-900">
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
                                <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-700">
                                  Recurring
                                </span>
                              ) : null}
                            </div>
                          </td>
                          <td className="py-3 pr-4">
                            <p className="font-medium text-gray-900">
                              {transaction.description}
                            </p>
                            {transaction.counterparty ? (
                              <p className="text-xs text-gray-500">
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
                          <td className="py-3 pr-4 font-medium text-gray-900">
                            {formatTransactionAmount(
                              transaction,
                              formatCurrency,
                            )}
                          </td>
                          <td className="py-3">
                            <div className="flex items-center gap-3">
                              {transaction.isRecurringGenerated ? (
                                <>
                                  <span className="text-xs text-gray-500">
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
                                        className="text-sm font-medium text-blue-600 hover:underline"
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
                                        className="text-sm font-medium text-amber-700 hover:underline disabled:cursor-not-allowed disabled:opacity-60"
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
                                    className="text-sm font-medium text-blue-600 hover:underline"
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
                                    className="text-sm font-medium text-red-600 hover:underline disabled:cursor-not-allowed disabled:opacity-60"
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

        <aside className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-gray-100">
          <h2 className="text-xl font-semibold text-gray-900">
            {occurrenceDraft
              ? "Override recurring month"
              : editingTransaction
                ? "Edit transaction"
                : "Create transaction"}
          </h2>
          <p className="mt-1 text-sm text-gray-500">
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
              <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4 text-sm text-gray-600">
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
