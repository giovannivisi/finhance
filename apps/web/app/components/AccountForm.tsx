"use client";

import { useEffect, useId, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { AccountFormValues } from "@lib/account-form";
import { buildAccountPayload } from "@lib/account-form";
import { ACCOUNT_TYPE_LABELS, ACCOUNT_TYPE_OPTIONS } from "@lib/accounts";
import { apiMutation } from "@lib/api";
import { useSingleFlightActions } from "@lib/single-flight";

interface AccountFormProps {
  accountId?: string;
  initialValues: AccountFormValues;
  mode: "create" | "edit";
  onSuccess?: () => void;
  onCancel?: () => void;
}

export default function AccountForm({
  accountId,
  initialValues,
  mode,
  onSuccess,
  onCancel,
}: AccountFormProps) {
  const router = useRouter();
  const fieldPrefix = useId();
  const [form, setForm] = useState<AccountFormValues>(initialValues);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const actions = useSingleFlightActions<"submit">();
  const isCreateMode = mode === "create";

  useEffect(() => {
    setForm(initialValues);
  }, [initialValues]);

  function updateField<Field extends keyof AccountFormValues>(
    field: Field,
    value: AccountFormValues[Field],
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

      const result = buildAccountPayload(form);
      if (!result.payload) {
        setError(result.error ?? "Unable to validate this account.");
        return;
      }

      if (!isCreateMode && !accountId) {
        setError("Missing account id for this edit.");
        return;
      }

      setIsSubmitting(true);

      try {
        await apiMutation(
          isCreateMode ? "/accounts" : `/accounts/${accountId}`,
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
              ? "Error creating account."
              : "Error updating account.",
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

      <div
        style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}
      >
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
                event.target.value as AccountFormValues["type"],
              )
            }
            onFocus={handleFocus}
            onBlur={handleBlur}
            required
          >
            {ACCOUNT_TYPE_OPTIONS.map((type) => (
              <option key={type} value={type}>
                {ACCOUNT_TYPE_LABELS[type]}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label
            htmlFor={`${fieldPrefix}-currency`}
            style={getLabelStyle(false)}
          >
            <span>Currency</span>
            <span style={{ fontSize: "10px", opacity: 0.6 }}>Optional</span>
          </label>
          <input
            id={`${fieldPrefix}-currency`}
            style={inputStyle}
            value={form.currency}
            onChange={(event) => updateField("currency", event.target.value)}
            onFocus={handleFocus}
            onBlur={handleBlur}
          />
        </div>
      </div>

      <div
        style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}
      >
        <div>
          <label
            htmlFor={`${fieldPrefix}-institution`}
            style={getLabelStyle(false)}
          >
            <span>Institution</span>
            <span style={{ fontSize: "10px", opacity: 0.6 }}>Optional</span>
          </label>
          <input
            id={`${fieldPrefix}-institution`}
            style={inputStyle}
            value={form.institution}
            onChange={(event) => updateField("institution", event.target.value)}
            onFocus={handleFocus}
            onBlur={handleBlur}
          />
        </div>

        <div>
          <label
            htmlFor={`${fieldPrefix}-opening-balance`}
            style={getLabelStyle(false)}
          >
            <span>Opening balance</span>
            <span style={{ fontSize: "10px", opacity: 0.6 }}>Optional</span>
          </label>
          <input
            id={`${fieldPrefix}-opening-balance`}
            style={inputStyle}
            type="number"
            step="0.01"
            value={form.openingBalance}
            onChange={(event) =>
              updateField("openingBalance", event.target.value)
            }
            onFocus={handleFocus}
            onBlur={handleBlur}
          />
        </div>
      </div>

      <div
        style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}
      >
        <div>
          <label
            htmlFor={`${fieldPrefix}-opening-balance-date`}
            style={getLabelStyle(false)}
          >
            <span>Opening balance date</span>
            <span style={{ fontSize: "10px", opacity: 0.6 }}>Optional</span>
          </label>
          <input
            id={`${fieldPrefix}-opening-balance-date`}
            style={inputStyle}
            type="date"
            value={form.openingBalanceDate}
            onChange={(event) =>
              updateField("openingBalanceDate", event.target.value)
            }
            onFocus={handleFocus}
            onBlur={handleBlur}
          />
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

      <div>
        <label htmlFor={`${fieldPrefix}-notes`} style={getLabelStyle(false)}>
          <span>Notes</span>
          <span style={{ fontSize: "10px", opacity: 0.6 }}>Optional</span>
        </label>
        <textarea
          id={`${fieldPrefix}-notes`}
          style={{ ...inputStyle, minHeight: "80px", resize: "vertical" }}
          value={form.notes}
          onChange={(event) => updateField("notes", event.target.value)}
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
            flex: 1,
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
              ? "Create Account"
              : "Save Changes"}
        </button>

        {onCancel ? (
          <button
            type="button"
            onClick={onCancel}
            style={{
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
