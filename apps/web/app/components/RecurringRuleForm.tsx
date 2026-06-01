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
    <form onSubmit={handleSubmit} className="app-form">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="app-form-field">
          <label htmlFor={`${fieldPrefix}-name`}>Name</label>
          <input
            id={`${fieldPrefix}-name`}
            value={form.name}
            onChange={(event) => updateField("name", event.target.value)}
            required
          />
        </div>

        <div className="app-form-field">
          <label htmlFor={`${fieldPrefix}-kind`}>Kind</label>
          <select
            id={`${fieldPrefix}-kind`}
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
        <div className="app-form-field">
          <label htmlFor={`${fieldPrefix}-amount`}>Amount</label>
          <input
            id={`${fieldPrefix}-amount`}
            type="number"
            step="0.01"
            value={form.amount}
            onChange={(event) => updateField("amount", event.target.value)}
            required
          />
        </div>

        <div className="app-form-field">
          <label htmlFor={`${fieldPrefix}-day-of-month`}>Day of month</label>
          <input
            id={`${fieldPrefix}-day-of-month`}
            type="number"
            min={1}
            max={31}
            value={form.dayOfMonth}
            onChange={(event) => updateField("dayOfMonth", event.target.value)}
            required
          />
        </div>

        {!isTransfer && !isAdjustment ? (
          <div className="app-form-field">
            <label htmlFor={`${fieldPrefix}-direction`}>Direction</label>
            <select
              id={`${fieldPrefix}-direction`}
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
          <div className="page-inline-notice surface-info">
            {isTransfer
              ? "Transfers create one outflow and one inflow row each month."
              : "Adjustments stay uncategorized and use the chosen direction."}
          </div>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="app-form-field">
          <label htmlFor={`${fieldPrefix}-start-date`}>Start date</label>
          <input
            id={`${fieldPrefix}-start-date`}
            type="date"
            value={form.startDate}
            onChange={(event) => updateField("startDate", event.target.value)}
            required
          />
        </div>

        <div className="app-form-field">
          <label htmlFor={`${fieldPrefix}-end-date`} className="is-optional">
            <span>End date</span>
            <span>Optional</span>
          </label>
          <input
            id={`${fieldPrefix}-end-date`}
            type="date"
            value={form.endDate}
            onChange={(event) => updateField("endDate", event.target.value)}
          />
        </div>
      </div>

      {isTransfer ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="app-form-field">
            <label htmlFor={`${fieldPrefix}-source-account`}>
              Source account
            </label>
            <select
              id={`${fieldPrefix}-source-account`}
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

          <div className="app-form-field">
            <label htmlFor={`${fieldPrefix}-destination-account`}>
              Destination account
            </label>
            <select
              id={`${fieldPrefix}-destination-account`}
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
          <div className="app-form-field">
            <label htmlFor={`${fieldPrefix}-account`}>Account</label>
            <select
              id={`${fieldPrefix}-account`}
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

          <div className="app-form-field">
            <label htmlFor={`${fieldPrefix}-category`}>Category</label>
            <select
              id={`${fieldPrefix}-category`}
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

      <div className="app-form-field">
        <label htmlFor={`${fieldPrefix}-description`}>Description</label>
        <input
          id={`${fieldPrefix}-description`}
          value={form.description}
          onChange={(event) => updateField("description", event.target.value)}
          required
        />
      </div>

      {!isTransfer ? (
        <div className="app-form-field">
          <label
            htmlFor={`${fieldPrefix}-counterparty`}
            className="is-optional"
          >
            <span>Counterparty</span>
            <span>Optional</span>
          </label>
          <input
            id={`${fieldPrefix}-counterparty`}
            value={form.counterparty}
            onChange={(event) =>
              updateField("counterparty", event.target.value)
            }
          />
        </div>
      ) : null}

      <div className="app-form-field">
        <label htmlFor={`${fieldPrefix}-notes`} className="is-optional">
          <span>Notes</span>
          <span>Optional</span>
        </label>
        <textarea
          id={`${fieldPrefix}-notes`}
          className="min-h-24"
          value={form.notes}
          onChange={(event) => updateField("notes", event.target.value)}
        />
      </div>

      <label className="page-pill max-w-max">
        <input
          type="checkbox"
          checked={form.isActive}
          onChange={(event) => updateField("isActive", event.target.checked)}
        />
        Rule is active
      </label>

      {error ? (
        <p role="alert" className="app-form-error">
          {error}
        </p>
      ) : null}

      <div className="app-form-actions">
        <button type="submit" disabled={isSubmitting} className="btn-primary">
          {isSubmitting
            ? "Saving..."
            : isCreateMode
              ? "Create Rule"
              : "Save Changes"}
        </button>

        {onCancel ? (
          <button type="button" onClick={onCancel} className="btn-secondary">
            Cancel
          </button>
        ) : null}
      </div>
    </form>
  );
}
