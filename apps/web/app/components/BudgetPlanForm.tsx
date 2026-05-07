"use client";

import { useEffect, useId, useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type {
  CategoryResponse,
  CreateCategoryBudgetRequest,
  MonthlyBudgetItemResponse,
  UpdateCategoryBudgetRequest,
} from "@finhance/shared";
import { apiMutation } from "@lib/api";
import { formatCategoryOptionLabel } from "@lib/categories";
import { expenseBudgetCategories } from "@lib/hierarchical-categories";
import { useSingleFlightActions } from "@lib/single-flight";

interface BudgetPlanFormProps {
  mode: "create" | "edit";
  budget?: MonthlyBudgetItemResponse | null;
  categories: CategoryResponse[];
  defaultMonth: string;
  preferredCategoryId?: string;
  preferredCurrency?: string;
  quickFillSuggestions?: Array<{
    key: "previous" | "average";
    label: string;
    amount: number;
  }>;
  onSuccess?: () => void;
  onCancel?: () => void;
}

interface BudgetPlanFormState {
  categoryId: string;
  currency: string;
  amount: string;
  startMonth: string;
  endMonth: string;
  effectiveMonth: string;
}

function buildInitialState(input: {
  mode: "create" | "edit";
  budget?: MonthlyBudgetItemResponse | null;
  defaultMonth: string;
  preferredCategoryId?: string;
  preferredCurrency?: string;
}): BudgetPlanFormState {
  if (input.mode === "edit" && input.budget) {
    return {
      categoryId: input.budget.categoryId,
      currency: input.budget.currency,
      amount: input.budget.budgetAmount.toFixed(2),
      startMonth: input.budget.startMonth,
      endMonth: input.budget.endMonth ?? "",
      effectiveMonth:
        input.defaultMonth < input.budget.startMonth
          ? input.budget.startMonth
          : input.defaultMonth,
    };
  }

  return {
    categoryId: input.preferredCategoryId ?? "",
    currency: input.preferredCurrency ?? "EUR",
    amount: "",
    startMonth: input.defaultMonth,
    endMonth: "",
    effectiveMonth: input.defaultMonth,
  };
}

export default function BudgetPlanForm({
  mode,
  budget,
  categories,
  defaultMonth,
  preferredCategoryId,
  preferredCurrency,
  quickFillSuggestions = [],
  onSuccess,
  onCancel,
}: BudgetPlanFormProps) {
  const router = useRouter();
  const fieldPrefix = useId();
  const [form, setForm] = useState<BudgetPlanFormState>(() =>
    buildInitialState({
      mode,
      budget,
      defaultMonth,
      preferredCategoryId,
      preferredCurrency,
    }),
  );
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const actions = useSingleFlightActions<"submit">();
  const isCreateMode = mode === "create";

  useEffect(() => {
    setForm(
      buildInitialState({
        mode,
        budget,
        defaultMonth,
        preferredCategoryId,
        preferredCurrency,
      }),
    );
  }, [budget, defaultMonth, mode, preferredCategoryId, preferredCurrency]);

  const selectableCategories = useMemo(
    () => expenseBudgetCategories(categories, form.categoryId),
    [categories, form.categoryId],
  );

  function updateField<Field extends keyof BudgetPlanFormState>(
    field: Field,
    value: BudgetPlanFormState[Field],
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

      if (isCreateMode && !form.categoryId) {
        setError("Select an expense category.");
        return;
      }

      if (!form.currency.trim()) {
        setError("Currency is required.");
        return;
      }

      const amount = Number(form.amount);
      if (!Number.isFinite(amount) || amount < 0) {
        setError("Amount must be zero or greater.");
        return;
      }

      setIsSubmitting(true);

      try {
        if (isCreateMode) {
          const payload: CreateCategoryBudgetRequest = {
            categoryId: form.categoryId,
            currency: form.currency.trim().toUpperCase(),
            amount,
            startMonth: form.startMonth,
            endMonth: form.endMonth || null,
          };

          await apiMutation("/budgets", {
            method: "POST",
            body: JSON.stringify(payload),
          });
        } else {
          if (!budget) {
            setError("Missing budget to update.");
            setIsSubmitting(false);
            return;
          }

          const payload: UpdateCategoryBudgetRequest = {
            amount,
            effectiveMonth: form.effectiveMonth,
            endMonth: form.endMonth || null,
          };

          await apiMutation(`/budgets/${budget.budgetId}`, {
            method: "PUT",
            body: JSON.stringify(payload),
          });
        }

        onSuccess?.();
        router.refresh();
      } catch (submitError) {
        setError(
          submitError instanceof Error
            ? submitError.message
            : isCreateMode
              ? "Unable to create this budget."
              : "Unable to update this budget.",
        );
      } finally {
        setIsSubmitting(false);
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="app-form">
      {isCreateMode ? (
        <div className="app-form-field">
          <label htmlFor={`${fieldPrefix}-category`}>Expense category</label>
          <select
            id={`${fieldPrefix}-category`}
            value={form.categoryId}
            onChange={(event) => updateField("categoryId", event.target.value)}
            required
          >
            <option value="">Choose a category</option>
            {selectableCategories.map((category) => (
              <option key={category.id} value={category.id}>
                {formatCategoryOptionLabel(category)}
              </option>
            ))}
          </select>
        </div>
      ) : budget ? (
        <div className="app-form-note">
          <p>
            <strong>{budget.categoryName}</strong>
          </p>
          <p className="mb-0 text-sm">
            {budget.currency} budget, active from {budget.startMonth}
            {budget.endMonth ? ` through ${budget.endMonth}` : " onward"}.
          </p>
        </div>
      ) : null}

      <div className="app-form-grid">
        <div className="app-form-field">
          <label htmlFor={`${fieldPrefix}-currency`}>Currency</label>
          <input
            id={`${fieldPrefix}-currency`}
            value={form.currency}
            onChange={(event) => updateField("currency", event.target.value)}
            disabled={!isCreateMode}
            required
          />
        </div>

        <div className="app-form-field">
          <label htmlFor={`${fieldPrefix}-amount`}>Monthly budget</label>
          <input
            id={`${fieldPrefix}-amount`}
            type="number"
            step="0.01"
            min="0"
            value={form.amount}
            onChange={(event) => updateField("amount", event.target.value)}
            required
          />
        </div>
      </div>

      {isCreateMode ? (
        <div className="app-form-grid">
          <div className="app-form-field">
            <label htmlFor={`${fieldPrefix}-start-month`}>Start month</label>
            <input
              id={`${fieldPrefix}-start-month`}
              type="month"
              value={form.startMonth}
              onChange={(event) =>
                updateField("startMonth", event.target.value)
              }
              required
            />
          </div>

          <div className="app-form-field">
            <label htmlFor={`${fieldPrefix}-end-month`} className="is-optional">
              <span>End month</span>
              <span>Optional</span>
            </label>
            <input
              id={`${fieldPrefix}-end-month`}
              type="month"
              value={form.endMonth}
              onChange={(event) => updateField("endMonth", event.target.value)}
            />
          </div>
        </div>
      ) : (
        <div className="app-form-grid">
          <div className="app-form-field">
            <label htmlFor={`${fieldPrefix}-effective-month`}>
              Apply from month
            </label>
            <input
              id={`${fieldPrefix}-effective-month`}
              type="month"
              value={form.effectiveMonth}
              onChange={(event) =>
                updateField("effectiveMonth", event.target.value)
              }
              required
            />
          </div>

          <div className="app-form-field">
            <label
              htmlFor={`${fieldPrefix}-edit-end-month`}
              className="is-optional"
            >
              <span>End month</span>
              <span>Optional</span>
            </label>
            <input
              id={`${fieldPrefix}-edit-end-month`}
              type="month"
              value={form.endMonth}
              onChange={(event) => updateField("endMonth", event.target.value)}
            />
          </div>
        </div>
      )}

      {quickFillSuggestions.length > 0 ? (
        <div className="app-form-note">
          <p>
            <strong>Quick-fill from recent spending</strong>
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {quickFillSuggestions.map((suggestion) => (
              <button
                key={suggestion.key}
                type="button"
                onClick={() =>
                  updateField("amount", suggestion.amount.toFixed(2))
                }
                className="btn-secondary"
              >
                {suggestion.label}: {suggestion.amount.toFixed(2)}
              </button>
            ))}
          </div>
        </div>
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
              ? "Create budget"
              : "Save changes"}
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
