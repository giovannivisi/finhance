"use client";

import { useEffect, useId, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type {
  CategoryBudgetOverrideResponse,
  MonthlyBudgetItemResponse,
  UpsertCategoryBudgetOverrideRequest,
} from "@finhance/shared";
import { apiMutation } from "@lib/api";
import { useSingleFlightActions } from "@lib/single-flight";

interface BudgetOverrideFormProps {
  budget: MonthlyBudgetItemResponse;
  month: string;
  overrides: CategoryBudgetOverrideResponse[];
  onSuccess?: () => void;
  onCancel?: () => void;
}

interface BudgetOverrideFormState {
  amount: string;
  note: string;
}

export default function BudgetOverrideForm({
  budget,
  month,
  overrides,
  onSuccess,
  onCancel,
}: BudgetOverrideFormProps) {
  const router = useRouter();
  const fieldPrefix = useId();
  const [form, setForm] = useState<BudgetOverrideFormState>({
    amount:
      budget.override?.month === month
        ? budget.override.amount.toFixed(2)
        : budget.budgetAmount.toFixed(2),
    note: budget.override?.month === month ? (budget.override.note ?? "") : "",
  });
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const actions = useSingleFlightActions<"submit" | "clear">();

  useEffect(() => {
    setForm({
      amount:
        budget.override?.month === month
          ? budget.override.amount.toFixed(2)
          : budget.budgetAmount.toFixed(2),
      note:
        budget.override?.month === month ? (budget.override.note ?? "") : "",
    });
  }, [budget, month]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    await actions.run("submit", async () => {
      setError(null);

      const amount = Number(form.amount);
      if (!Number.isFinite(amount) || amount < 0) {
        setError("Override amount must be zero or greater.");
        return;
      }

      setIsSubmitting(true);

      try {
        const payload: UpsertCategoryBudgetOverrideRequest = {
          amount,
          note: form.note.trim() || null,
        };

        await apiMutation(`/budgets/${budget.budgetId}/overrides/${month}`, {
          method: "PUT",
          body: JSON.stringify(payload),
        });

        onSuccess?.();
        router.refresh();
      } catch (submitError) {
        setError(
          submitError instanceof Error
            ? submitError.message
            : "Unable to save this month override.",
        );
      } finally {
        setIsSubmitting(false);
      }
    });
  }

  async function handleClear() {
    await actions.run("clear", async () => {
      setError(null);
      setIsSubmitting(true);

      try {
        await apiMutation<void>(
          `/budgets/${budget.budgetId}/overrides/${month}`,
          {
            method: "DELETE",
          },
        );

        onSuccess?.();
        router.refresh();
      } catch (clearError) {
        setError(
          clearError instanceof Error
            ? clearError.message
            : "Unable to clear this override.",
        );
      } finally {
        setIsSubmitting(false);
      }
    });
  }

  const currentOverride =
    overrides.find((override) => override.month === month) ?? null;

  return (
    <div className="space-y-4">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700">
          <p className="font-medium text-gray-900">{budget.categoryName}</p>
          <p className="mt-1">
            {month} in {budget.currency}. Base budget{" "}
            {budget.budgetAmount.toFixed(2)}.
          </p>
        </div>

        <div className="flex flex-col gap-1">
          <label
            htmlFor={`${fieldPrefix}-amount`}
            className="text-sm font-medium text-gray-600"
          >
            Override amount
          </label>
          <input
            id={`${fieldPrefix}-amount`}
            className="rounded-lg border px-3 py-2"
            type="number"
            step="0.01"
            min="0"
            value={form.amount}
            onChange={(event) =>
              setForm((previous) => ({
                ...previous,
                amount: event.target.value,
              }))
            }
            required
          />
        </div>

        <div className="flex flex-col gap-1">
          <label
            htmlFor={`${fieldPrefix}-note`}
            className="text-sm font-medium text-gray-600"
          >
            Note
          </label>
          <textarea
            id={`${fieldPrefix}-note`}
            className="rounded-lg border px-3 py-2"
            rows={3}
            value={form.note}
            onChange={(event) =>
              setForm((previous) => ({
                ...previous,
                note: event.target.value,
              }))
            }
          />
        </div>

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
              : currentOverride
                ? "Update override"
                : "Save override"}
          </button>

          {currentOverride ? (
            <button
              type="button"
              onClick={() => void handleClear()}
              disabled={isSubmitting}
              className="rounded-lg border px-4 py-2 text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Clear override
            </button>
          ) : null}

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

      {overrides.length > 0 ? (
        <div className="rounded-2xl border border-gray-200 bg-white p-4">
          <h3 className="text-sm font-semibold text-gray-900">
            Saved month overrides
          </h3>
          <ul className="mt-3 space-y-2 text-sm text-gray-600">
            {overrides.map((override) => (
              <li key={override.id} className="rounded-xl bg-gray-50 px-3 py-2">
                <div className="flex items-center justify-between gap-3">
                  <span className="font-medium text-gray-900">
                    {override.month}
                  </span>
                  <span>{override.amount.toFixed(2)}</span>
                </div>
                {override.note ? (
                  <p className="mt-1 text-xs text-gray-500">{override.note}</p>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
