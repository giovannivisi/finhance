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
    () =>
      categories.filter(
        (category) =>
          category.type === "EXPENSE" &&
          (category.archivedAt === null || category.id === form.categoryId),
      ),
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
    <form onSubmit={handleSubmit} className="space-y-4">
      {isCreateMode ? (
        <div className="flex flex-col gap-1">
          <label
            htmlFor={`${fieldPrefix}-category`}
            className="text-sm font-medium text-gray-600"
          >
            Expense category
          </label>
          <select
            id={`${fieldPrefix}-category`}
            className="rounded-lg border px-3 py-2"
            value={form.categoryId}
            onChange={(event) => updateField("categoryId", event.target.value)}
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
        <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700">
          <p className="font-medium text-gray-900">{budget.categoryName}</p>
          <p className="mt-1">
            {budget.currency} budget, active from {budget.startMonth}
            {budget.endMonth ? ` through ${budget.endMonth}` : " onward"}.
          </p>
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <label
            htmlFor={`${fieldPrefix}-currency`}
            className="text-sm font-medium text-gray-600"
          >
            Currency
          </label>
          <input
            id={`${fieldPrefix}-currency`}
            className="rounded-lg border px-3 py-2"
            value={form.currency}
            onChange={(event) => updateField("currency", event.target.value)}
            disabled={!isCreateMode}
            required
          />
        </div>

        <div className="flex flex-col gap-1">
          <label
            htmlFor={`${fieldPrefix}-amount`}
            className="text-sm font-medium text-gray-600"
          >
            Monthly budget
          </label>
          <input
            id={`${fieldPrefix}-amount`}
            className="rounded-lg border px-3 py-2"
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
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1">
            <label
              htmlFor={`${fieldPrefix}-start-month`}
              className="text-sm font-medium text-gray-600"
            >
              Start month
            </label>
            <input
              id={`${fieldPrefix}-start-month`}
              className="rounded-lg border px-3 py-2"
              type="month"
              value={form.startMonth}
              onChange={(event) =>
                updateField("startMonth", event.target.value)
              }
              required
            />
          </div>

          <div className="flex flex-col gap-1">
            <label
              htmlFor={`${fieldPrefix}-end-month`}
              className="text-sm font-medium text-gray-600"
            >
              End month
            </label>
            <input
              id={`${fieldPrefix}-end-month`}
              className="rounded-lg border px-3 py-2"
              type="month"
              value={form.endMonth}
              onChange={(event) => updateField("endMonth", event.target.value)}
            />
          </div>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1">
            <label
              htmlFor={`${fieldPrefix}-effective-month`}
              className="text-sm font-medium text-gray-600"
            >
              Apply from month
            </label>
            <input
              id={`${fieldPrefix}-effective-month`}
              className="rounded-lg border px-3 py-2"
              type="month"
              value={form.effectiveMonth}
              onChange={(event) =>
                updateField("effectiveMonth", event.target.value)
              }
              required
            />
          </div>

          <div className="flex flex-col gap-1">
            <label
              htmlFor={`${fieldPrefix}-edit-end-month`}
              className="text-sm font-medium text-gray-600"
            >
              End month
            </label>
            <input
              id={`${fieldPrefix}-edit-end-month`}
              className="rounded-lg border px-3 py-2"
              type="month"
              value={form.endMonth}
              onChange={(event) => updateField("endMonth", event.target.value)}
            />
          </div>
        </div>
      )}

      {quickFillSuggestions.length > 0 ? (
        <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
          <p className="text-sm font-medium text-gray-700">
            Quick-fill from recent spending
          </p>
          <div className="mt-3 flex flex-wrap gap-3">
            {quickFillSuggestions.map((suggestion) => (
              <button
                key={suggestion.key}
                type="button"
                onClick={() =>
                  updateField("amount", suggestion.amount.toFixed(2))
                }
                className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                {suggestion.label}: {suggestion.amount.toFixed(2)}
              </button>
            ))}
          </div>
        </div>
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
              ? "Create budget"
              : "Save changes"}
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
