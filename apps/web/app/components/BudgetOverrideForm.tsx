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

  const getLabelStyle = (required: boolean) => ({
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    fontSize: "12px",
    fontWeight: required ? 700 : 500,
    color: required ? "var(--text-primary)" : "var(--text-tertiary)",
    textTransform: "uppercase" as const,
    letterSpacing: "0.06em",
    marginBottom: "8px",
  });

  const inputStyle = {
    width: "100%",
    background: "var(--bg-app)",
    border: "1px solid var(--border-glass-strong)",
    borderRadius: "8px",
    padding: "10px 14px",
    color: "var(--text-primary)",
    fontSize: "15px",
    outline: "none",
    transition: "border-color 0.2s",
    boxSizing: "border-box" as const,
  };

  const handleFocus = (
    e: React.FocusEvent<
      HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
    >,
  ) => (e.target.style.borderColor = "var(--text-secondary)");
  const handleBlur = (
    e: React.FocusEvent<
      HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
    >,
  ) => (e.target.style.borderColor = "var(--border-glass-strong)");

  const currentOverride =
    overrides.find((override) => override.month === month) ?? null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
      <form
        onSubmit={handleSubmit}
        style={{ display: "flex", flexDirection: "column", gap: "16px" }}
      >
        <div
          style={{
            padding: "16px",
            borderRadius: "16px",
            background: "var(--bg-card-hover)",
            border: "1px solid var(--border-glass-strong)",
            fontSize: "14px",
            color: "var(--text-secondary)",
          }}
        >
          <p
            style={{
              fontWeight: 600,
              color: "var(--text-primary)",
              marginBottom: "4px",
            }}
          >
            {budget.categoryName}
          </p>
          <p style={{ fontSize: "13px" }}>
            {month} in {budget.currency}. Base budget{" "}
            {budget.budgetAmount.toFixed(2)}.
          </p>
        </div>

        <div>
          <label htmlFor={`${fieldPrefix}-amount`} style={getLabelStyle(true)}>
            <span>Override amount</span>
          </label>
          <input
            id={`${fieldPrefix}-amount`}
            style={inputStyle}
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
            onFocus={handleFocus}
            onBlur={handleBlur}
            required
          />
        </div>

        <div>
          <label htmlFor={`${fieldPrefix}-note`} style={getLabelStyle(false)}>
            <span>Note</span>
            <span style={{ fontSize: "10px", opacity: 0.6 }}>Optional</span>
          </label>
          <textarea
            id={`${fieldPrefix}-note`}
            style={{ ...inputStyle, minHeight: "80px", resize: "vertical" }}
            value={form.note}
            onChange={(event) =>
              setForm((previous) => ({
                ...previous,
                note: event.target.value,
              }))
            }
            onFocus={handleFocus}
            onBlur={handleBlur}
          />
        </div>

        {error ? (
          <p
            role="alert"
            style={{
              fontSize: "14px",
              color: "var(--color-expense)",
              background: "rgba(239, 68, 68, 0.1)",
              padding: "12px",
              borderRadius: "8px",
              border: "1px solid rgba(239, 68, 68, 0.2)",
            }}
          >
            {error}
          </p>
        ) : null}

        <div style={{ display: "flex", gap: "12px", marginTop: "8px" }}>
          <button
            type="submit"
            disabled={isSubmitting}
            style={{
              flex: 2,
              background: "var(--text-primary)",
              color: "var(--bg-app)",
              padding: "12px 24px",
              borderRadius: "8px",
              fontWeight: 600,
              fontSize: "15px",
              border: "none",
              cursor: isSubmitting ? "not-allowed" : "pointer",
              opacity: isSubmitting ? 0.6 : 1,
              transition: "opacity 0.2s",
            }}
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
              style={{
                flex: 1,
                padding: "12px 24px",
                borderRadius: "8px",
                border: "1px solid var(--border-glass-strong)",
                background: "transparent",
                color: "var(--color-expense)",
                fontWeight: 500,
                fontSize: "15px",
                cursor: "pointer",
                transition: "background 0.2s",
              }}
              onMouseOver={(e) =>
                (e.currentTarget.style.background = "rgba(239, 68, 68, 0.05)")
              }
              onMouseOut={(e) =>
                (e.currentTarget.style.background = "transparent")
              }
            >
              Clear
            </button>
          ) : null}

          {onCancel ? (
            <button
              type="button"
              onClick={onCancel}
              style={{
                flex: 1,
                padding: "12px 24px",
                borderRadius: "8px",
                border: "1px solid var(--border-glass-strong)",
                background: "transparent",
                color: "var(--text-secondary)",
                fontWeight: 500,
                fontSize: "15px",
                cursor: "pointer",
                transition: "background 0.2s",
              }}
              onMouseOver={(e) =>
                (e.currentTarget.style.background = "var(--bg-card-hover)")
              }
              onMouseOut={(e) =>
                (e.currentTarget.style.background = "transparent")
              }
            >
              Cancel
            </button>
          ) : null}
        </div>
      </form>

      {overrides.length > 0 ? (
        <div
          style={{
            padding: "20px",
            borderRadius: "24px",
            background: "var(--bg-glass-card)",
            border: "1px solid var(--border-glass-strong)",
          }}
        >
          <h3
            style={{
              fontSize: "14px",
              fontWeight: 600,
              color: "var(--text-primary)",
              marginBottom: "16px",
            }}
          >
            Saved month overrides
          </h3>
          <ul
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "8px",
            }}
          >
            {overrides.map((override) => (
              <li
                key={override.id}
                style={{
                  padding: "12px 16px",
                  borderRadius: "12px",
                  background: "var(--bg-card-hover)",
                  border: "1px solid var(--border-glass-strong)",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: "12px",
                  }}
                >
                  <span
                    style={{
                      fontSize: "13px",
                      fontWeight: 600,
                      color: "var(--text-primary)",
                    }}
                  >
                    {override.month}
                  </span>
                  <span
                    style={{
                      fontSize: "13px",
                      fontWeight: 600,
                      color: "var(--text-primary)",
                    }}
                  >
                    {override.amount.toFixed(2)}
                  </span>
                </div>
                {override.note ? (
                  <p
                    style={{
                      marginTop: "4px",
                      fontSize: "12px",
                      color: "var(--text-tertiary)",
                      fontStyle: "italic",
                    }}
                  >
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
