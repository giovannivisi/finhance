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
import { apiMutation } from "@lib/api";
import { useSingleFlightActions } from "@lib/single-flight";

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
  const actions = useSingleFlightActions<"submit">();

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
    await actions.run("submit", async () => {
      setError(null);

      const result = buildRecurringOccurrencePayload(form);
      if (!result.payload) {
        setError(
          result.error ?? "Unable to validate this recurring occurrence.",
        );
        return;
      }

      setIsSubmitting(true);

      try {
        await apiMutation(
          `/recurring-rules/${ruleId}/occurrences/${form.occurrenceMonth}`,
          {
            method: "PUT",
            body: JSON.stringify(result.payload),
          },
        );

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
    });
  }

  const isTransfer = form.kind === "TRANSFER";
  const isAdjustment = form.kind === "ADJUSTMENT";

  return (
    <form onSubmit={handleSubmit} className="app-form">
      <div className="app-form-grid is-relaxed">
        <div className="app-form-field">
          <label htmlFor={`${fieldPrefix}-month`}>Month</label>
          <input
            id={`${fieldPrefix}-month`}
            type="month"
            value={form.occurrenceMonth}
            readOnly
          />
        </div>

        <div className="app-form-note">
          {TRANSACTION_KIND_LABELS[form.kind]} override
        </div>
      </div>

      <div className="app-form-grid is-relaxed">
        <div className="app-form-field">
          <label htmlFor={`${fieldPrefix}-posted-at-date`}>
            Occurrence date
          </label>
          <input
            id={`${fieldPrefix}-posted-at-date`}
            type="date"
            value={form.postedAtDate}
            onChange={(event) =>
              updateField("postedAtDate", event.target.value)
            }
            required
          />
        </div>

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
      </div>

      {isTransfer ? (
        <div className="app-form-grid is-relaxed">
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
        <div className="app-form-grid is-relaxed">
          <div className="app-form-field">
            <label htmlFor={`${fieldPrefix}-account`}>Account</label>
            <select
              id={`${fieldPrefix}-account`}
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

          <div className="app-form-field">
            <label htmlFor={`${fieldPrefix}-direction`}>Direction</label>
            <select
              id={`${fieldPrefix}-direction`}
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
        <div className="app-form-field">
          <label htmlFor={`${fieldPrefix}-category`} className="is-optional">
            <span>Category</span>
            <span>Optional</span>
          </label>
          <select
            id={`${fieldPrefix}-category`}
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
        <label htmlFor={`${fieldPrefix}-description`}>Description</label>
        <input
          id={`${fieldPrefix}-description`}
          value={form.description}
          onChange={(event) => updateField("description", event.target.value)}
          required
        />
      </div>

      <div className="app-form-field">
        <label htmlFor={`${fieldPrefix}-notes`} className="is-optional">
          <span>Notes</span>
          <span>Optional</span>
        </label>
        <textarea
          id={`${fieldPrefix}-notes`}
          className="min-h-28"
          value={form.notes}
          onChange={(event) => updateField("notes", event.target.value)}
        />
      </div>

      {error ? (
        <p role="alert" className="app-form-error">
          {error}
        </p>
      ) : null}

      <div className="app-form-actions">
        <button type="submit" disabled={isSubmitting} className="btn-primary">
          {isSubmitting ? "Saving..." : "Save override"}
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
