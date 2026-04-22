"use client";

import { useEffect, useId, useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type {
  AccountResponse,
  CategoryResponse,
  TransactionResponse,
} from "@finhance/shared";
import {
  buildTransactionPayload,
  type TransactionFormValues,
} from "@lib/transaction-form";
import { formatAccountOptionLabel } from "@lib/accounts";
import { formatCategoryOptionLabel } from "@lib/categories";
import {
  TRANSACTION_DIRECTION_LABELS,
  TRANSACTION_DIRECTION_OPTIONS,
  TRANSACTION_KIND_LABELS,
  TRANSACTION_KIND_OPTIONS,
} from "@lib/transactions";
import { apiMutation } from "@lib/api";
import { useSingleFlightActions } from "@lib/single-flight";

interface TransactionFormProps {
  transactionId?: string;
  initialValues: TransactionFormValues;
  mode: "create" | "edit";
  accounts: AccountResponse[];
  categories: CategoryResponse[];
  editingTransaction?: TransactionResponse | null;
  onSuccess?: () => void;
  onCancel?: () => void;
}

function selectableAccounts(
  accounts: AccountResponse[],
  selectedId: string,
): AccountResponse[] {
  return accounts.filter(
    (account) => account.archivedAt === null || account.id === selectedId,
  );
}

function selectableCategories(
  categories: CategoryResponse[],
  type: CategoryResponse["type"],
  selectedId: string,
): CategoryResponse[] {
  return categories.filter(
    (category) =>
      category.type === type &&
      (category.archivedAt === null || category.id === selectedId),
  );
}

export default function TransactionForm({
  transactionId,
  initialValues,
  mode,
  accounts,
  categories,
  editingTransaction,
  onSuccess,
  onCancel,
}: TransactionFormProps) {
  const router = useRouter();
  const fieldPrefix = useId();
  const [form, setForm] = useState<TransactionFormValues>(initialValues);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const actions = useSingleFlightActions<"submit">();
  const isCreateMode = mode === "create";

  useEffect(() => {
    setForm(initialValues);
  }, [initialValues]);

  const standardAccounts = useMemo(
    () => selectableAccounts(accounts, form.accountId),
    [accounts, form.accountId],
  );
  const sourceAccounts = useMemo(
    () => selectableAccounts(accounts, form.sourceAccountId),
    [accounts, form.sourceAccountId],
  );
  const destinationAccounts = useMemo(
    () => selectableAccounts(accounts, form.destinationAccountId),
    [accounts, form.destinationAccountId],
  );
  const visibleCategories = useMemo(() => {
    if (form.kind === "INCOME") {
      return selectableCategories(categories, "INCOME", form.categoryId);
    }

    if (form.kind === "EXPENSE") {
      return selectableCategories(categories, "EXPENSE", form.categoryId);
    }

    return [];
  }, [categories, form.categoryId, form.kind]);

  function updateField<Field extends keyof TransactionFormValues>(
    field: Field,
    value: TransactionFormValues[Field],
  ) {
    setForm((previous) => ({
      ...previous,
      [field]: value,
    }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await actions.run("submit", async () => {
      setError(null);

      const result = buildTransactionPayload(form);
      if (!result.payload) {
        setError(result.error ?? "Unable to validate this transaction.");
        return;
      }

      if (!isCreateMode && !transactionId) {
        setError("Missing transaction id for this edit.");
        return;
      }

      setIsSubmitting(true);

      try {
        await apiMutation(
          isCreateMode ? "/transactions" : `/transactions/${transactionId}`,
          {
            method: isCreateMode ? "POST" : "PUT",
            body: JSON.stringify(result.payload),
          },
        );

        onSuccess?.();
        router.refresh();
      } catch (submitError) {
        setError(
          submitError instanceof Error
            ? submitError.message
            : isCreateMode
              ? "Error creating transaction."
              : "Error updating transaction.",
        );
      } finally {
        setIsSubmitting(false);
      }
    });
  }

  const isTransfer = form.kind === "TRANSFER";
  const isAdjustment = form.kind === "ADJUSTMENT";

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <label
            htmlFor={`${fieldPrefix}-posted-at`}
            className="text-sm font-medium text-gray-600"
          >
            Posted at
          </label>
          <input
            id={`${fieldPrefix}-posted-at`}
            className="rounded-lg border px-3 py-2"
            type="datetime-local"
            value={form.postedAt}
            onChange={(event) => updateField("postedAt", event.target.value)}
            required
          />
        </div>

        <div className="flex flex-col gap-1">
          <label
            htmlFor={`${fieldPrefix}-kind`}
            className="text-sm font-medium text-gray-600"
          >
            Kind
          </label>
          <select
            id={`${fieldPrefix}-kind`}
            className="rounded-lg border px-3 py-2"
            value={form.kind}
            disabled={!isCreateMode}
            onChange={(event) =>
              updateField(
                "kind",
                event.target.value as TransactionFormValues["kind"],
              )
            }
          >
            {TRANSACTION_KIND_OPTIONS.map((kind) => (
              <option key={kind} value={kind}>
                {TRANSACTION_KIND_LABELS[kind]}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <label
            htmlFor={`${fieldPrefix}-amount`}
            className="text-sm font-medium text-gray-600"
          >
            Amount
          </label>
          <input
            id={`${fieldPrefix}-amount`}
            className="rounded-lg border px-3 py-2"
            type="number"
            step="0.01"
            value={form.amount}
            onChange={(event) => updateField("amount", event.target.value)}
            required
          />
        </div>

        {!isTransfer ? (
          <div className="flex flex-col gap-1">
            <label
              htmlFor={`${fieldPrefix}-account`}
              className="text-sm font-medium text-gray-600"
            >
              Account
            </label>
            <select
              id={`${fieldPrefix}-account`}
              className="rounded-lg border px-3 py-2"
              value={form.accountId}
              onChange={(event) => updateField("accountId", event.target.value)}
              required
            >
              <option value="">Select an account</option>
              {standardAccounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {formatAccountOptionLabel(account)}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-950">
            Transfers create one outflow row and one inflow row underneath.
          </div>
        )}
      </div>

      {isTransfer ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1">
            <label
              htmlFor={`${fieldPrefix}-source-account`}
              className="text-sm font-medium text-gray-600"
            >
              Source account
            </label>
            <select
              id={`${fieldPrefix}-source-account`}
              className="rounded-lg border px-3 py-2"
              value={form.sourceAccountId}
              onChange={(event) =>
                updateField("sourceAccountId", event.target.value)
              }
              required
            >
              <option value="">Select a source account</option>
              {sourceAccounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {formatAccountOptionLabel(account)}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label
              htmlFor={`${fieldPrefix}-destination-account`}
              className="text-sm font-medium text-gray-600"
            >
              Destination account
            </label>
            <select
              id={`${fieldPrefix}-destination-account`}
              className="rounded-lg border px-3 py-2"
              value={form.destinationAccountId}
              onChange={(event) =>
                updateField("destinationAccountId", event.target.value)
              }
              required
            >
              <option value="">Select a destination account</option>
              {destinationAccounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {formatAccountOptionLabel(account)}
                </option>
              ))}
            </select>
          </div>
        </div>
      ) : null}

      {!isTransfer && isAdjustment ? (
        <div className="flex flex-col gap-1">
          <label
            htmlFor={`${fieldPrefix}-direction`}
            className="text-sm font-medium text-gray-600"
          >
            Direction
          </label>
          <select
            id={`${fieldPrefix}-direction`}
            className="rounded-lg border px-3 py-2"
            value={form.direction}
            onChange={(event) =>
              updateField(
                "direction",
                event.target.value as TransactionFormValues["direction"],
              )
            }
          >
            {TRANSACTION_DIRECTION_OPTIONS.map((direction) => (
              <option key={direction} value={direction}>
                {TRANSACTION_DIRECTION_LABELS[direction]}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      {!isTransfer ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {!isAdjustment ? (
            <div className="flex flex-col gap-1">
              <label
                htmlFor={`${fieldPrefix}-category`}
                className="text-sm font-medium text-gray-600"
              >
                Category
              </label>
              <select
                id={`${fieldPrefix}-category`}
                className="rounded-lg border px-3 py-2"
                value={form.categoryId}
                onChange={(event) =>
                  updateField("categoryId", event.target.value)
                }
              >
                <option value="">No category</option>
                {visibleCategories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {formatCategoryOptionLabel(category)}
                  </option>
                ))}
              </select>
              {!visibleCategories.length ? (
                <p className="text-xs text-gray-500">
                  No matching categories available.
                </p>
              ) : null}
            </div>
          ) : null}

          <div className="flex flex-col gap-1">
            <label
              htmlFor={`${fieldPrefix}-counterparty`}
              className="text-sm font-medium text-gray-600"
            >
              Counterparty
            </label>
            <input
              id={`${fieldPrefix}-counterparty`}
              className="rounded-lg border px-3 py-2"
              value={form.counterparty}
              onChange={(event) =>
                updateField("counterparty", event.target.value)
              }
            />
          </div>
        </div>
      ) : null}

      <div className="flex flex-col gap-1">
        <label
          htmlFor={`${fieldPrefix}-description`}
          className="text-sm font-medium text-gray-600"
        >
          Description
        </label>
        <input
          id={`${fieldPrefix}-description`}
          className="rounded-lg border px-3 py-2"
          value={form.description}
          onChange={(event) => updateField("description", event.target.value)}
          required
        />
      </div>

      <div className="flex flex-col gap-1">
        <label
          htmlFor={`${fieldPrefix}-notes`}
          className="text-sm font-medium text-gray-600"
        >
          Notes
        </label>
        <textarea
          id={`${fieldPrefix}-notes`}
          className="min-h-28 rounded-lg border px-3 py-2"
          value={form.notes}
          onChange={(event) => updateField("notes", event.target.value)}
        />
      </div>

      {editingTransaction?.kind === "TRANSFER" ? (
        <p className="text-xs text-gray-500">
          This transaction keeps its transfer identity. To convert it into a
          non-transfer entry, delete it and create a new one.
        </p>
      ) : null}

      {error ? (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      ) : null}

      <div className="flex gap-3">
        <button
          type="submit"
          disabled={isSubmitting}
          className="rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSubmitting
            ? "Saving..."
            : isCreateMode
              ? "Create Transaction"
              : "Save Changes"}
        </button>

        {onCancel ? (
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border px-4 py-2 text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
        ) : null}
      </div>
    </form>
  );
}
