"use client";

import { useEffect, useId, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { CategoryFormValues } from "@lib/category-form";
import { buildCategoryPayload } from "@lib/category-form";
import { CATEGORY_TYPE_LABELS, CATEGORY_TYPE_OPTIONS } from "@lib/categories";
import { apiMutation } from "@lib/api";
import { useSingleFlightActions } from "@lib/single-flight";

interface CategoryFormProps {
  categoryId?: string;
  initialValues: CategoryFormValues;
  mode: "create" | "edit";
  onSuccess?: () => void;
  onCancel?: () => void;
}

export default function CategoryForm({
  categoryId,
  initialValues,
  mode,
  onSuccess,
  onCancel,
}: CategoryFormProps) {
  const router = useRouter();
  const fieldPrefix = useId();
  const [form, setForm] = useState<CategoryFormValues>(initialValues);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const actions = useSingleFlightActions<"submit">();
  const isCreateMode = mode === "create";

  useEffect(() => {
    setForm(initialValues);
  }, [initialValues]);

  function updateField<Field extends keyof CategoryFormValues>(
    field: Field,
    value: CategoryFormValues[Field],
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

      const result = buildCategoryPayload(form);
      if (!result.payload) {
        setError(result.error ?? "Unable to validate this category.");
        return;
      }

      if (!isCreateMode && !categoryId) {
        setError("Missing category id for this edit.");
        return;
      }

      setIsSubmitting(true);

      try {
        await apiMutation(
          isCreateMode ? "/categories" : `/categories/${categoryId}`,
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
              ? "Error creating category."
              : "Error updating category.",
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
    <form onSubmit={handleSubmit} className="app-form">
      <div>
        <label htmlFor={`${fieldPrefix}-name`} style={getLabelStyle(true)}>
          <span>Name</span>
        </label>
        <input
          id={`${fieldPrefix}-name`}
          style={inputStyle}
          value={form.name}
          onChange={(event) => updateField("name", event.target.value)}
          onFocus={handleFocus}
          onBlur={handleBlur}
          required
        />
      </div>

      <div className="app-form-grid">
        <div>
          <label htmlFor={`${fieldPrefix}-type`} style={getLabelStyle(true)}>
            <span>Type</span>
          </label>
          <select
            id={`${fieldPrefix}-type`}
            style={{ ...inputStyle, cursor: "pointer", appearance: "none" }}
            value={form.type}
            onChange={(event) =>
              updateField(
                "type",
                event.target.value as CategoryFormValues["type"],
              )
            }
            onFocus={handleFocus}
            onBlur={handleBlur}
            required
          >
            {CATEGORY_TYPE_OPTIONS.map((type) => (
              <option key={type} value={type}>
                {CATEGORY_TYPE_LABELS[type]}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor={`${fieldPrefix}-order`} style={getLabelStyle(false)}>
            <span>Order</span>
            <span style={{ fontSize: "10px", opacity: 0.6 }}>Optional</span>
          </label>
          <input
            id={`${fieldPrefix}-order`}
            style={inputStyle}
            type="number"
            value={form.order}
            onChange={(event) => updateField("order", event.target.value)}
            onFocus={handleFocus}
            onBlur={handleBlur}
          />
        </div>
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
            : isCreateMode
              ? "Create Category"
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
