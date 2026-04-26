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

  return (
    <form
      onSubmit={handleSubmit}
      style={{ display: "flex", flexDirection: "column", gap: "16px" }}
    >
      {isCreateMode ? (
        <div>
          <label
            htmlFor={`${fieldPrefix}-category`}
            style={getLabelStyle(true)}
          >
            <span>Expense category</span>
          </label>
          <select
            id={`${fieldPrefix}-category`}
            style={{ ...inputStyle, cursor: "pointer", appearance: "none" }}
            value={form.categoryId}
            onChange={(event) => updateField("categoryId", event.target.value)}
            onFocus={handleFocus}
            onBlur={handleBlur}
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
            {budget.currency} budget, active from {budget.startMonth}
            {budget.endMonth ? ` through ${budget.endMonth}` : " onward"}.
          </p>
        </div>
      ) : null}

      <div
        style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}
      >
        <div>
          <label
            htmlFor={`${fieldPrefix}-currency`}
            style={getLabelStyle(true)}
          >
            <span>Currency</span>
          </label>
          <input
            id={`${fieldPrefix}-currency`}
            style={inputStyle}
            value={form.currency}
            onChange={(event) => updateField("currency", event.target.value)}
            onFocus={handleFocus}
            onBlur={handleBlur}
            disabled={!isCreateMode}
            required
          />
        </div>

        <div>
          <label htmlFor={`${fieldPrefix}-amount`} style={getLabelStyle(true)}>
            <span>Monthly budget</span>
          </label>
          <input
            id={`${fieldPrefix}-amount`}
            style={inputStyle}
            type="number"
            step="0.01"
            min="0"
            value={form.amount}
            onChange={(event) => updateField("amount", event.target.value)}
            onFocus={handleFocus}
            onBlur={handleBlur}
            required
          />
        </div>
      </div>

      {isCreateMode ? (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "16px",
          }}
        >
          <div>
            <label
              htmlFor={`${fieldPrefix}-start-month`}
              style={getLabelStyle(true)}
            >
              <span>Start month</span>
            </label>
            <input
              id={`${fieldPrefix}-start-month`}
              style={inputStyle}
              type="month"
              value={form.startMonth}
              onChange={(event) =>
                updateField("startMonth", event.target.value)
              }
              onFocus={handleFocus}
              onBlur={handleBlur}
              required
            />
          </div>

          <div>
            <label
              htmlFor={`${fieldPrefix}-end-month`}
              style={getLabelStyle(false)}
            >
              <span>End month</span>
              <span style={{ fontSize: "10px", opacity: 0.6 }}>Optional</span>
            </label>
            <input
              id={`${fieldPrefix}-end-month`}
              style={inputStyle}
              type="month"
              value={form.endMonth}
              onChange={(event) => updateField("endMonth", event.target.value)}
              onFocus={handleFocus}
              onBlur={handleBlur}
            />
          </div>
        </div>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "16px",
          }}
        >
          <div>
            <label
              htmlFor={`${fieldPrefix}-effective-month`}
              style={getLabelStyle(true)}
            >
              <span>Apply from month</span>
            </label>
            <input
              id={`${fieldPrefix}-effective-month`}
              style={inputStyle}
              type="month"
              value={form.effectiveMonth}
              onChange={(event) =>
                updateField("effectiveMonth", event.target.value)
              }
              onFocus={handleFocus}
              onBlur={handleBlur}
              required
            />
          </div>

          <div>
            <label
              htmlFor={`${fieldPrefix}-edit-end-month`}
              style={getLabelStyle(false)}
            >
              <span>End month</span>
              <span style={{ fontSize: "10px", opacity: 0.6 }}>Optional</span>
            </label>
            <input
              id={`${fieldPrefix}-edit-end-month`}
              style={inputStyle}
              type="month"
              value={form.endMonth}
              onChange={(event) => updateField("endMonth", event.target.value)}
              onFocus={handleFocus}
              onBlur={handleBlur}
            />
          </div>
        </div>
      )}

      {quickFillSuggestions.length > 0 ? (
        <div
          style={{
            padding: "16px",
            borderRadius: "16px",
            background: "var(--bg-card-hover)",
            border: "1px solid var(--border-glass-strong)",
          }}
        >
          <p
            style={{
              fontSize: "13px",
              fontWeight: 600,
              color: "var(--text-secondary)",
              marginBottom: "12px",
            }}
          >
            Quick-fill from recent spending
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
            {quickFillSuggestions.map((suggestion) => (
              <button
                key={suggestion.key}
                type="button"
                onClick={() =>
                  updateField("amount", suggestion.amount.toFixed(2))
                }
                style={{
                  padding: "8px 12px",
                  borderRadius: "8px",
                  border: "1px solid var(--border-glass-strong)",
                  background: "var(--bg-app)",
                  color: "var(--text-primary)",
                  fontSize: "13px",
                  fontWeight: 500,
                  cursor: "pointer",
                  transition: "background 0.2s",
                }}
                onMouseOver={(e) =>
                  (e.currentTarget.style.background = "var(--bg-card-hover)")
                }
                onMouseOut={(e) =>
                  (e.currentTarget.style.background = "var(--bg-app)")
                }
              >
                {suggestion.label}: {suggestion.amount.toFixed(2)}
              </button>
            ))}
          </div>
        </div>
      ) : null}

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
            : isCreateMode
              ? "Create budget"
              : "Save changes"}
        </button>

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
  );
}
