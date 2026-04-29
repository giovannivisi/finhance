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
    <div className="section-stack-tight">
      <form onSubmit={handleSubmit} className="app-form">
        <div className="app-form-note">
          <p>
            <strong>{budget.categoryName}</strong>
          </p>
          <p className="mb-0 text-sm">
            {month} in {budget.currency}. Base budget{" "}
            {budget.budgetAmount.toFixed(2)}.
          </p>
        </div>

        <div className="app-form-field">
          <label htmlFor={`${fieldPrefix}-amount`}>Override amount</label>
          <input
            id={`${fieldPrefix}-amount`}
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

        <div className="app-form-field">
          <label htmlFor={`${fieldPrefix}-note`} className="is-optional">
            <span>Note</span>
            <span>Optional</span>
          </label>
          <textarea
            id={`${fieldPrefix}-note`}
            className="min-h-24"
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
          <p role="alert" className="app-form-error">
            {error}
          </p>
        ) : null}

        <div className="app-form-actions">
          <button type="submit" disabled={isSubmitting} className="btn-primary">
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
              className="btn-secondary"
            >
              Clear
            </button>
          ) : null}

          {onCancel ? (
            <button type="button" onClick={onCancel} className="btn-secondary">
              Cancel
            </button>
          ) : null}
        </div>
      </form>

      {overrides.length > 0 ? (
        <div className="app-form-note">
          <p>
            <strong>Saved month overrides</strong>
          </p>
          <ul className="mt-3 flex flex-col gap-2">
            {overrides.map((override) => (
              <li
                key={override.id}
                className={`detail-panel is-compact ${
                  override.month === month ? "" : "surface-muted"
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-semibold text-[var(--text-primary)]">
                    {override.month}
                  </span>
                  <span className="text-sm font-semibold text-[var(--text-primary)]">
                    {override.amount.toFixed(2)}
                  </span>
                </div>
                {override.note ? (
                  <p className="mt-1 text-xs italic text-[var(--text-tertiary)]">
                    {override.note}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
