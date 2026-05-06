"use client";

import { useEffect, useId, useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type {
  AccountResponse,
  CategoryResponse,
  ExpenseValidationRuleResponse,
  TransactionResponse,
} from "@finhance/shared";
import {
  buildTransactionPayload,
  type TransactionFormValues,
} from "@lib/transaction-form";
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
  expenseValidationRules: ExpenseValidationRuleResponse[];
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

export default function TransactionForm({
  transactionId,
  initialValues,
  mode,
  accounts,
  categories,
  expenseValidationRules,
  editingTransaction,
  onSuccess,
  onCancel,
}: TransactionFormProps) {
  const router = useRouter();
  const fieldPrefix = useId();
  const [form, setForm] = useState<TransactionFormValues>(initialValues);
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
  const isCreateMode = mode === "create";
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

  function updateField<Field extends keyof TransactionFormValues>(
    field: Field,
    value: TransactionFormValues[Field],
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

  return (
    <form onSubmit={handleSubmit} className="app-form">
      <div className="app-form-field">
        <label htmlFor={`${fieldPrefix}-description`}>Description</label>
        <input
          id={`${fieldPrefix}-description`}
          value={form.description}
          onChange={(event) => handleDescriptionChange(event.target.value)}
          required
        />
      </div>

      <div className="app-form-grid is-relaxed">
        <div className="app-form-field">
          <label htmlFor={`${fieldPrefix}-posted-at`}>Posted at</label>
          <input
            id={`${fieldPrefix}-posted-at`}
            type="datetime-local"
            value={form.postedAt}
            onChange={(event) => updateField("postedAt", event.target.value)}
            required
          />
        </div>

        <div className="app-form-field">
          <label htmlFor={`${fieldPrefix}-kind`}>Kind</label>
          <select
            id={`${fieldPrefix}-kind`}
            value={form.kind}
            disabled={!isCreateMode}
            onChange={(event) => {
              const nextKind = event.target
                .value as TransactionFormValues["kind"];
              updateField("kind", nextKind);
              if (nextKind === "EXPENSE") {
                setSelectedExpensePrimaryId(
                  deriveExpensePrimaryId(categories, form.categoryId),
                );
              } else {
                setSelectedExpensePrimaryId("");
                setHasManualExpenseCategoryOverride(false);
              }
            }}
          >
            {TRANSACTION_KIND_OPTIONS.map((kind) => (
              <option key={kind} value={kind}>
                {TRANSACTION_KIND_LABELS[kind]}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="app-form-grid is-relaxed">
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

        {!isTransfer ? (
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
        ) : (
          <div className="app-form-note">
            Transfers create one outflow row and one inflow row underneath.
          </div>
        )}
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
      ) : null}

      {!isTransfer && isAdjustment ? (
        <div className="app-form-field">
          <label htmlFor={`${fieldPrefix}-direction`}>Direction</label>
          <select
            id={`${fieldPrefix}-direction`}
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
        <div className="app-form-grid is-relaxed">
          {!isAdjustment && isExpense ? (
            <>
              <div className="app-form-field">
                <label
                  htmlFor={`${fieldPrefix}-primary-category`}
                  className="is-optional"
                >
                  <span>Primary</span>
                  <span>Optional</span>
                </label>
                <select
                  id={`${fieldPrefix}-primary-category`}
                  value={selectedExpensePrimaryId}
                  onChange={(event) =>
                    handleExpensePrimaryChange(event.target.value)
                  }
                >
                  <option value="">No primary</option>
                  {visibleExpensePrimaries.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="app-form-field">
                <label
                  htmlFor={`${fieldPrefix}-secondary-category`}
                  className="is-optional"
                >
                  <span>Secondary</span>
                  <span>Optional</span>
                </label>
                <select
                  id={`${fieldPrefix}-secondary-category`}
                  value={form.categoryId}
                  onChange={(event) =>
                    handleExpenseSecondaryChange(event.target.value)
                  }
                >
                  <option value="">No secondary</option>
                  {visibleExpenseSecondaries.map((category) => (
                    <option key={category.id} value={category.id}>
                      {formatCategoryOptionLabel(category)}
                    </option>
                  ))}
                </select>
                {selectedExpensePrimaryId &&
                !visibleExpenseSecondaries.length ? (
                  <p className="text-xs text-[var(--text-tertiary)]">
                    No secondary categories under this primary.
                  </p>
                ) : null}
              </div>
            </>
          ) : null}

          {!isAdjustment && isIncome ? (
            <div className="app-form-field">
              <label
                htmlFor={`${fieldPrefix}-category`}
                className="is-optional"
              >
                <span>Category</span>
                <span>Optional</span>
              </label>
              <select
                id={`${fieldPrefix}-category`}
                value={form.categoryId}
                onChange={(event) =>
                  updateField("categoryId", event.target.value)
                }
              >
                <option value="">No category</option>
                {visibleIncomeCategories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {formatCategoryOptionLabel(category)}
                  </option>
                ))}
              </select>
              {!visibleIncomeCategories.length ? (
                <p className="text-xs text-[var(--text-tertiary)]">
                  No matching categories available.
                </p>
              ) : null}
            </div>
          ) : null}

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

      {editingTransaction?.kind === "TRANSFER" ? (
        <p className="text-xs text-[var(--text-tertiary)]">
          This transaction keeps its transfer identity. To convert it into a
          non-transfer entry, delete it and create a new one.
        </p>
      ) : null}

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
              ? "Create Transaction"
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
