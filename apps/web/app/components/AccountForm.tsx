"use client";

import { useEffect, useId, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { AccountFormValues } from "@lib/account-form";
import { buildAccountPayload } from "@lib/account-form";
import { ACCOUNT_TYPE_LABELS, ACCOUNT_TYPE_OPTIONS } from "@lib/accounts";
import { apiMutation } from "@lib/api";
import SearchablePicker from "@components/SearchablePicker";
import { getCurrencyPickerOptions } from "@lib/currency-ui";
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
  const currencyOptions = getCurrencyPickerOptions();

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
                event.target.value as AccountFormValues["type"],
              )
            }
            required
          >
            {ACCOUNT_TYPE_OPTIONS.map((type) => (
              <option key={type} value={type}>
                {ACCOUNT_TYPE_LABELS[type]}
              </option>
            ))}
          </select>
        </div>

        <div className="app-form-field">
          <label htmlFor={`${fieldPrefix}-currency`} className="is-optional">
            <span>Currency</span>
            <span>Optional</span>
          </label>
          <SearchablePicker
            id={`${fieldPrefix}-currency`}
            value={form.currency}
            onChange={(nextValue) => updateField("currency", nextValue)}
            options={currencyOptions}
            placeholder="Choose a currency"
            searchPlaceholder="Search currencies…"
          />
        </div>
      </div>

      <div className="app-form-grid is-relaxed">
        <div className="app-form-field">
          <label htmlFor={`${fieldPrefix}-institution`} className="is-optional">
            <span>Institution</span>
            <span>Optional</span>
          </label>
          <input
            id={`${fieldPrefix}-institution`}
            value={form.institution}
            onChange={(event) => updateField("institution", event.target.value)}
          />
        </div>

        <div className="app-form-field">
          <label
            htmlFor={`${fieldPrefix}-opening-balance`}
            className="is-optional"
          >
            <span>Opening balance</span>
            <span>Optional</span>
          </label>
          <input
            id={`${fieldPrefix}-opening-balance`}
            type="number"
            step="0.01"
            value={form.openingBalance}
            onChange={(event) =>
              updateField("openingBalance", event.target.value)
            }
          />
        </div>
      </div>

      <div className="app-form-grid is-relaxed">
        <div className="app-form-field">
          <label
            htmlFor={`${fieldPrefix}-opening-balance-date`}
            className="is-optional"
          >
            <span>Opening balance date</span>
            <span>Optional</span>
          </label>
          <input
            id={`${fieldPrefix}-opening-balance-date`}
            type="date"
            value={form.openingBalanceDate}
            onChange={(event) =>
              updateField("openingBalanceDate", event.target.value)
            }
          />
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
              ? "Create Account"
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
