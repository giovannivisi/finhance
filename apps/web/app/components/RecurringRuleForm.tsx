"use client";

import { useEffect, useId, useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { AccountResponse, CategoryResponse } from "@finhance/shared";
import {
  buildRecurringRulePayload,
  type RecurringRuleFormValues,
} from "@lib/recurring-rule-form";
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

interface RecurringRuleFormProps {
  mode: "create" | "edit";
  ruleId?: string;
  initialValues: RecurringRuleFormValues;
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

export default function RecurringRuleForm({
  mode,
  ruleId,
  initialValues,
  accounts,
  categories,
  onSuccess,
  onCancel,
}: RecurringRuleFormProps) {
  const router = useRouter();
  const fieldPrefix = useId();
  const [form, setForm] = useState<RecurringRuleFormValues>(initialValues);
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

  function updateField<Field extends keyof RecurringRuleFormValues>(
    field: Field,
    value: RecurringRuleFormValues[Field],
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

      const result = buildRecurringRulePayload(form);
      if (!result.payload) {
        setError(result.error ?? "Unable to validate this recurring rule.");
        return;
      }

      if (!isCreateMode && !ruleId) {
        setError("Missing recurring rule id for this edit.");
        return;
      }

      setIsSubmitting(true);

      try {
        await apiMutation(
          isCreateMode ? "/recurring-rules" : `/recurring-rules/${ruleId}`,
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
              ? "Error creating recurring rule."
              : "Error updating recurring rule.",
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
            htmlFor={`${fieldPrefix}-name`}
            className="text-sm font-medium text-gray-600"
          >
            Name
          </label>
          <input
            id={`${fieldPrefix}-name`}
            className="rounded-lg border px-3 py-2"
            value={form.name}
            onChange={(event) => updateField("name", event.target.value)}
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
            onChange={(event) =>
              updateField(
                "kind",
                event.target.value as RecurringRuleFormValues["kind"],
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

      <div className="grid gap-4 sm:grid-cols-3">
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

        <div className="flex flex-col gap-1">
          <label
            htmlFor={`${fieldPrefix}-day-of-month`}
            className="text-sm font-medium text-gray-600"
          >
            Day of month
          </label>
          <input
            id={`${fieldPrefix}-day-of-month`}
            className="rounded-lg border px-3 py-2"
            type="number"
            min={1}
            max={31}
            value={form.dayOfMonth}
            onChange={(event) => updateField("dayOfMonth", event.target.value)}
            required
          />
        </div>

        {!isTransfer && !isAdjustment ? (
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
                  event.target.value as RecurringRuleFormValues["direction"],
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
        ) : (
          <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-950">
            {isTransfer
              ? "Transfers create one outflow and one inflow row each month."
              : "Adjustments stay uncategorized and use the chosen direction."}
          </div>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <label
            htmlFor={`${fieldPrefix}-start-date`}
            className="text-sm font-medium text-gray-600"
          >
            Start date
          </label>
          <input
            id={`${fieldPrefix}-start-date`}
            className="rounded-lg border px-3 py-2"
            type="date"
            value={form.startDate}
            onChange={(event) => updateField("startDate", event.target.value)}
            required
          />
        </div>

        <div className="flex flex-col gap-1">
          <label
            htmlFor={`${fieldPrefix}-end-date`}
            className="text-sm font-medium text-gray-600"
          >
            End date
          </label>
          <input
            id={`${fieldPrefix}-end-date`}
            className="rounded-lg border px-3 py-2"
            type="date"
            value={form.endDate}
            onChange={(event) => updateField("endDate", event.target.value)}
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
              disabled={isAdjustment}
            >
              <option value="">
                {isAdjustment ? "Not used for adjustments" : "No category"}
              </option>
              {visibleCategories.map((category) => (
                <option key={category.id} value={category.id}>
                  {formatCategoryOptionLabel(category)}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

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
          />
        </div>
      ) : null}

      <div className="flex flex-col gap-1">
        <label
          htmlFor={`${fieldPrefix}-notes`}
          className="text-sm font-medium text-gray-600"
        >
          Notes
        </label>
        <textarea
          id={`${fieldPrefix}-notes`}
          className="min-h-24 rounded-lg border px-3 py-2"
          value={form.notes}
          onChange={(event) => updateField("notes", event.target.value)}
        />
      </div>

      <label className="flex items-center gap-2 text-sm text-gray-600">
        <input
          type="checkbox"
          checked={form.isActive}
          onChange={(event) => updateField("isActive", event.target.checked)}
        />
        Rule is active
      </label>

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
              ? "Create Rule"
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
