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

  return (
    <form onSubmit={handleSubmit} className="app-form">
      <div className="app-form-field">
        <label htmlFor={`${fieldPrefix}-name`}>Name</label>
        <input
          id={`${fieldPrefix}-name`}
          value={form.name}
          onChange={(event) => updateField("name", event.target.value)}
          required
        />
      </div>

      <div className="app-form-grid is-relaxed">
        <div className="app-form-field">
          <label htmlFor={`${fieldPrefix}-type`}>Type</label>
          <select
            id={`${fieldPrefix}-type`}
            value={form.type}
            onChange={(event) =>
              updateField(
                "type",
                event.target.value as CategoryFormValues["type"],
              )
            }
            required
          >
            {CATEGORY_TYPE_OPTIONS.map((type) => (
              <option key={type} value={type}>
                {CATEGORY_TYPE_LABELS[type]}
              </option>
            ))}
          </select>
        </div>

        <div className="app-form-field">
          <label htmlFor={`${fieldPrefix}-order`} className="is-optional">
            <span>Order</span>
            <span>Optional</span>
          </label>
          <input
            id={`${fieldPrefix}-order`}
            type="number"
            value={form.order}
            onChange={(event) => updateField("order", event.target.value)}
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
