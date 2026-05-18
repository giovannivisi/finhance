"use client";

import { useEffect, useId, useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type {
  AccountResponse,
  CategoryResponse,
  ExpenseValidationRuleResponse,
} from "@finhance/shared";
import {
  buildRecurringOccurrencePayload,
  type RecurringOccurrenceFormValues,
} from "@lib/recurring-occurrence-form";
import { formatAccountOptionLabel } from "@lib/accounts";
import { formatCategoryOptionLabel } from "@lib/categories";
import {
  deriveExpensePrimaryId,
  expensePrimaryCategories,
  expenseSecondaryCategories,
  findMatchingExpenseValidationRule,
  incomeCategories,
} from "@lib/hierarchical-categories";
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
  expenseValidationRules: ExpenseValidationRuleResponse[];
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

export default function RecurringOccurrenceForm({
  ruleId,
  initialValues,
  accounts,
  categories,
  expenseValidationRules,
  onSuccess,
  onCancel,
}: RecurringOccurrenceFormProps) {
  const router = useRouter();
  const fieldPrefix = useId();
  const [form, setForm] =
    useState<RecurringOccurrenceFormValues>(initialValues);
  const [selectedExpensePrimaryId, setSelectedExpensePrimaryId] = useState(
    deriveExpensePrimaryId(categories, initialValues.categoryId),
  );
  const [
    hasManualExpenseCategoryOverride,
    setHasManualExpenseCategoryOverride,
  ] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const actions = useSingleFlightActions<"submit">();
  const isTransfer = form.kind === "TRANSFER";
  const isAdjustment = form.kind === "ADJUSTMENT";
  const isExpense = form.kind === "EXPENSE";
  const isIncome = form.kind === "INCOME";

  useEffect(() => {
    setForm(initialValues);
    setSelectedExpensePrimaryId(
      deriveExpensePrimaryId(categories, initialValues.categoryId),
    );
    setHasManualExpenseCategoryOverride(false);
  }, [categories, initialValues]);

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
  const visibleIncomeCategories = useMemo(
    () => incomeCategories(categories, form.categoryId),
    [categories, form.categoryId],
  );
  const visibleExpensePrimaries = useMemo(
    () => expensePrimaryCategories(categories, selectedExpensePrimaryId),
    [categories, selectedExpensePrimaryId],
  );
  const visibleExpenseSecondaries = useMemo(
    () =>
      selectedExpensePrimaryId
        ? expenseSecondaryCategories(
            categories,
            selectedExpensePrimaryId,
            form.categoryId,
          )
        : [],
    [categories, form.categoryId, selectedExpensePrimaryId],
  );

  function updateField<Field extends keyof RecurringOccurrenceFormValues>(
    field: Field,
    value: RecurringOccurrenceFormValues[Field],
  ) {
    setForm((previous) => ({
      ...previous,
      [field]: value,
    }));
  }

  function handleDescriptionChange(value: string) {
    setForm((previous) => ({
      ...previous,
      description: value,
    }));

    if (form.kind !== "EXPENSE" || hasManualExpenseCategoryOverride) {
      return;
    }

    const matchingRule = findMatchingExpenseValidationRule(
      expenseValidationRules,
      value,
    );
    if (!matchingRule) {
      return;
    }

    setSelectedExpensePrimaryId(matchingRule.primaryCategoryId);
    setForm((previous) => ({
      ...previous,
      description: value,
      categoryId: matchingRule.secondaryCategoryId,
    }));
  }

  function handleExpensePrimaryChange(primaryCategoryId: string) {
    setSelectedExpensePrimaryId(primaryCategoryId);
    setHasManualExpenseCategoryOverride(primaryCategoryId !== "");
    updateField("categoryId", "");
  }

  function handleExpenseSecondaryChange(categoryId: string) {
    updateField("categoryId", categoryId);
    setHasManualExpenseCategoryOverride(categoryId !== "");
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

      {!isTransfer && !isAdjustment && isExpense ? (
        <div className="app-form-grid is-relaxed">
          <div className="app-form-field">
            <label htmlFor={`${fieldPrefix}-primary-category`}>Primary</label>
            <select
              id={`${fieldPrefix}-primary-category`}
              value={selectedExpensePrimaryId}
              onChange={(event) =>
                handleExpensePrimaryChange(event.target.value)
              }
            >
              <option value="">Select primary…</option>
              {visibleExpensePrimaries.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </div>

          <div className="app-form-field">
            <label htmlFor={`${fieldPrefix}-secondary-category`}>
              Secondary
            </label>
            <select
              id={`${fieldPrefix}-secondary-category`}
              value={form.categoryId}
              onChange={(event) =>
                handleExpenseSecondaryChange(event.target.value)
              }
            >
              <option value="">Select secondary…</option>
              {visibleExpenseSecondaries.map((category) => (
                <option key={category.id} value={category.id}>
                  {formatCategoryOptionLabel(category)}
                </option>
              ))}
            </select>
          </div>
        </div>
      ) : null}

      {!isTransfer && !isAdjustment && isIncome ? (
        <div className="app-form-field">
          <label htmlFor={`${fieldPrefix}-category`}>
            <span>Category</span>
          </label>
          <select
            id={`${fieldPrefix}-category`}
            value={form.categoryId}
            onChange={(event) => updateField("categoryId", event.target.value)}
          >
            <option value="">Select category…</option>
            {visibleIncomeCategories.map((category) => (
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
          onChange={(event) => handleDescriptionChange(event.target.value)}
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
