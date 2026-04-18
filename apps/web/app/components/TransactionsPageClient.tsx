"use client";

import {
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type CSSProperties,
} from "react";
import { useRouter } from "next/navigation";
import type {
  AccountResponse,
  CategoryResponse,
  TransactionResponse,
} from "@finhance/shared";
import TransactionForm from "@components/TransactionForm";
import {
  createEmptyTransactionFormValues,
  transactionToFormValues,
} from "@lib/transaction-form";
import { getApiUrl, readApiError } from "@lib/api";
import { formatCurrency } from "@lib/format";
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

type AccentTextStyle = CSSProperties & {
  "--accent-primary": string;
  "--accent-secondary": string;
};

const DATETIME_FORMATTER = new Intl.DateTimeFormat("it-IT", {
  dateStyle: "medium",
  timeStyle: "short",
});

const DANGER_ACCENT_TEXT_STYLE: AccentTextStyle = {
  "--accent-primary": "var(--accent-danger)",
  "--accent-secondary": "var(--accent-warning)",
};

export default function TransactionsPageClient({
  transactions,
  accounts,
  categories,
  initialFilters,
}: {
  transactions: TransactionResponse[];
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
  const [deletingTransactionId, setDeletingTransactionId] = useState<
    string | null
  >(null);

  useEffect(() => {
    setFilters(initialFilters);
  }, [initialFilters]);

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

  // Group transactions by date string (e.g. "TODAY", "YESTERDAY", or formatted date)
  const groupedTransactions = transactions.reduce(
    (acc, transaction) => {
      const date = new Date(transaction.postedAt);
      const today = new Date();
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);

      let dateKey = date.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
      if (date.toDateString() === today.toDateString()) {
        dateKey = "TODAY";
      } else if (date.toDateString() === yesterday.toDateString()) {
        dateKey = "YESTERDAY";
      }

      if (!acc[dateKey]) acc[dateKey] = [];
      acc[dateKey].push(transaction);
      return acc;
    },
    {} as Record<string, typeof transactions>,
  );

  return (
    <div
      className="flex-col lg:flex-row gap-12 mt-4"
      style={{ alignItems: "flex-start" }}
    >
      {/* Left Sidebar Form */}
      <aside className="w-full lg:w-1/3 flex-col gap-4 sticky top-8">
        <div>
          <h1 className="text-h1 mb-2 text-gradient">New Transaction</h1>
          <p className="text-secondary text-sm">
            Record a new asset or expense entry.
          </p>
        </div>

        <div
          className="glass-card"
          style={{ padding: "32px", marginTop: "16px" }}
        >
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
        </div>
      </aside>

      {/* Right Content Area */}
      <div className="w-full lg:w-2/3 flex-col gap-8">
        {/* Filters Section (Collapsed/Simplified) */}
        <section className="glass-card" style={{ padding: "24px" }}>
          <div className="flex-row items-center justify-between mb-4">
            <h2 className="text-h4 font-bold">Filters</h2>
            <button
              type="button"
              onClick={handleClearFilters}
              className="text-sm font-medium"
              style={{ color: "var(--accent-primary)" }}
            >
              Clear All
            </button>
          </div>
          <form
            onSubmit={handleFilterSubmit}
            className="flex-row flex-wrap gap-4"
          >
            <input
              className="input-field"
              type="date"
              value={filters.from}
              onChange={(event) => updateFilter("from", event.target.value)}
              style={{ flex: 1, minWidth: "120px" }}
            />
            <input
              className="input-field"
              type="date"
              value={filters.to}
              onChange={(event) => updateFilter("to", event.target.value)}
              style={{ flex: 1, minWidth: "120px" }}
            />
            <select
              className="input-field"
              value={filters.kind}
              onChange={(event) => updateFilter("kind", event.target.value)}
              style={{ flex: 1, minWidth: "150px" }}
            >
              <option value="">All kinds</option>
              {Object.entries(TRANSACTION_KIND_LABELS).map(([kind, label]) => (
                <option key={kind} value={kind}>
                  {label}
                </option>
              ))}
            </select>
            <select
              className="input-field"
              value={filters.categoryId}
              onChange={(event) =>
                updateFilter("categoryId", event.target.value)
              }
              style={{ flex: 1, minWidth: "150px" }}
            >
              <option value="">All categories</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
            <button type="submit" className="btn btn-primary">
              Apply
            </button>
          </form>
        </section>

        {/* Activity Feed */}
        <section>
          <div className="flex-row items-center justify-between mb-6">
            <h2 className="text-h2">Recent Activity</h2>
          </div>

          {deleteError ? (
            <p
              role="alert"
              className="mb-4 text-sm text-gradient"
              style={DANGER_ACCENT_TEXT_STYLE}
            >
              {deleteError}
            </p>
          ) : null}

          {transactions.length === 0 ? (
            <div
              className="glass-card flex-row justify-center items-center"
              style={{ padding: "48px" }}
            >
              <p className="text-secondary text-sm">
                No transactions match the current filters.
              </p>
            </div>
          ) : (
            <div
              className="glass-card flex-col gap-8"
              style={{ padding: "32px" }}
            >
              {Object.entries(groupedTransactions).map(
                ([dateLabel, dailyTransactions]) => (
                  <div key={dateLabel} className="flex-col gap-4">
                    <p className="text-xs font-bold text-secondary tracking-widest uppercase">
                      {dateLabel}
                    </p>

                    <div className="flex-col gap-4">
                      {dailyTransactions.map((transaction) => {
                        const category =
                          transaction.categoryId !== null
                            ? categoriesById.get(transaction.categoryId)
                            : null;

                        const isPositive = transaction.direction === "INFLOW";
                        const amountColor = isPositive
                          ? "var(--accent-primary)"
                          : "var(--text-primary)";

                        return (
                          <div
                            key={transaction.id}
                            className="flex-row items-center justify-between"
                            style={{ padding: "12px 0" }}
                          >
                            <div className="flex-row items-center gap-4">
                              <div
                                className="avatar"
                                style={{
                                  backgroundColor: "var(--surface-container)",
                                  width: 48,
                                  height: 48,
                                }}
                              >
                                <span className="text-xs font-bold">
                                  {transaction.description.charAt(0)}
                                </span>
                              </div>
                              <div className="flex-col">
                                <p className="text-body font-bold">
                                  {transaction.description}
                                </p>
                                <div className="flex-row gap-2 items-center">
                                  <p className="text-xs text-secondary">
                                    {category?.name ?? "Uncategorized"}
                                  </p>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setEditingTransactionId(transaction.id)
                                    }
                                    className="text-xs font-bold hover:underline"
                                    style={{ color: "var(--text-secondary)" }}
                                  >
                                    Edit
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      void handleDelete(transaction.id)
                                    }
                                    className="text-xs font-bold hover:underline"
                                    style={{ color: "var(--accent-danger)" }}
                                  >
                                    {deletingTransactionId === transaction.id
                                      ? "..."
                                      : "Delete"}
                                  </button>
                                </div>
                              </div>
                            </div>

                            <div
                              className="flex-col"
                              style={{ alignItems: "flex-end" }}
                            >
                              <p
                                className="text-h4 font-bold"
                                style={{ color: amountColor }}
                              >
                                {isPositive ? "+" : ""}
                                {formatTransactionAmount(
                                  transaction,
                                  formatCurrency,
                                )}
                              </p>
                              <p className="text-xs text-secondary">
                                {DATETIME_FORMATTER.format(
                                  new Date(transaction.postedAt),
                                )}
                              </p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ),
              )}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
