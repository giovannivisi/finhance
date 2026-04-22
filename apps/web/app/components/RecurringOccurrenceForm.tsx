"use client";

import { useEffect, useId, useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { AccountResponse, CategoryResponse } from "@finhance/shared";
import {
  buildRecurringOccurrencePayload,
  type RecurringOccurrenceFormValues,
} from "@lib/recurring-occurrence-form";
import { formatAccountOptionLabel } from "@lib/accounts";
import { formatCategoryOptionLabel } from "@lib/categories";
import {
  TRANSACTION_DIRECTION_OPTIONS,
  TRANSACTION_DIRECTION_LABELS,
  TRANSACTION_KIND_LABELS,
} from "@lib/transactions";
import { getApiUrl, readApiError } from "@lib/api";

interface RecurringOccurrenceFormProps {
  ruleId: string;
  initialValues: RecurringOccurrenceFormValues;
  accounts: AccountResponse[];
  categories: CategoryResponse[];
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

export default function RecurringOccurrenceForm({
  ruleId,
  initialValues,
  accounts,
  categories,
  onSuccess,
  onCancel,
}: RecurringOccurrenceFormProps) {
  const router = useRouter();
  const fieldPrefix = useId();
  const [form, setForm] =
    useState<RecurringOccurrenceFormValues>(initialValues);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

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

  function updateField<Field extends keyof RecurringOccurrenceFormValues>(
    field: Field,
    value: RecurringOccurrenceFormValues[Field],
  ) {
    setForm((previous) => ({
      ...previous,
      [field]: value,
    }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const result = buildRecurringOccurrencePayload(form);
    if (!result.payload) {
      setError(result.error ?? "Unable to validate this recurring occurrence.");
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch(
        getApiUrl(
          `/recurring-rules/${ruleId}/occurrences/${form.occurrenceMonth}`,
        ),
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(result.payload),
        },
      );

      if (!response.ok) {
        setError(await readApiError(response));
        return;
      }

      onSuccess?.();
      router.refresh();
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Unable to save this recurring override.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  const isTransfer = form.kind === "TRANSFER";
  const isAdjustment = form.kind === "ADJUSTMENT";

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <label
            htmlFor={`${fieldPrefix}-month`}
            className="text-sm font-medium text-gray-600"
          >
            Month
          </label>
          <input
            id={`${fieldPrefix}-month`}
            className="rounded-lg border px-3 py-2"
            type="month"
            value={form.occurrenceMonth}
            readOnly
          />
        </div>

        <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-950">
          {TRANSACTION_KIND_LABELS[form.kind]} override
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <label
            htmlFor={`${fieldPrefix}-posted-at-date`}
            className="text-sm font-medium text-gray-600"
          >
            Occurrence date
          </label>
          <input
            id={`${fieldPrefix}-posted-at-date`}
            className="rounded-lg border px-3 py-2"
            type="date"
            value={form.postedAtDate}
            onChange={(event) =>
              updateField("postedAtDate", event.target.value)
            }
            required
          />
        </div>

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
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
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
              disabled={form.kind === "EXPENSE" || form.kind === "INCOME"}
              onChange={(event) =>
                updateField(
                  "direction",
                  event.target
                    .value as RecurringOccurrenceFormValues["direction"],
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
        </div>
      )}

      {!isTransfer && !isAdjustment ? (
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
            onChange={(event) => updateField("categoryId", event.target.value)}
          >
            <option value="">Uncategorized</option>
            {visibleCategories.map((category) => (
              <option key={category.id} value={category.id}>
                {formatCategoryOptionLabel(category)}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      {!isTransfer ? (
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
            placeholder="Optional"
          />
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
          placeholder="Optional"
        />
      </div>

      {error ? (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      ) : null}

      <div className="flex items-center justify-end gap-3">
        {onCancel ? (
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
        ) : null}

        <button
          type="submit"
          disabled={isSubmitting}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSubmitting ? "Saving..." : "Save override"}
        </button>
      </div>
    </form>
  );
}
