"use client";

import { useEffect, useId, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { AccountFormValues } from "@lib/account-form";
import { buildAccountPayload } from "@lib/account-form";
import { ACCOUNT_TYPE_LABELS, ACCOUNT_TYPE_OPTIONS } from "@lib/accounts";
import { getApiUrl, readApiError } from "@lib/api";

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
      const response = await fetch(
        getApiUrl(isCreateMode ? "/accounts" : `/accounts/${accountId}`),
        {
          method: isCreateMode ? "POST" : "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(result.payload),
        },
      );

      if (!response.ok) {
        setError(await readApiError(response));
        return;
      }

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
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="flex flex-col gap-1">
        <label
          htmlFor={`${fieldPrefix}-name`}
          className="text-sm font-medium text-gray-600"
        >
          Name
        </label>
        <input
          id={`${fieldPrefix}-name`}
          className="rounded-lg border px-3 py-2"
          value={form.name}
          onChange={(event) => updateField("name", event.target.value)}
          required
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <label
            htmlFor={`${fieldPrefix}-type`}
            className="text-sm font-medium text-gray-600"
          >
            Type
          </label>
          <select
            id={`${fieldPrefix}-type`}
            className="rounded-lg border px-3 py-2"
            value={form.type}
            onChange={(event) =>
              updateField(
                "type",
                event.target.value as AccountFormValues["type"],
              )
            }
          >
            {ACCOUNT_TYPE_OPTIONS.map((type) => (
              <option key={type} value={type}>
                {ACCOUNT_TYPE_LABELS[type]}
              </option>
            ))}
          </select>
        </div>

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
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <label
            htmlFor={`${fieldPrefix}-institution`}
            className="text-sm font-medium text-gray-600"
          >
            Institution
          </label>
          <input
            id={`${fieldPrefix}-institution`}
            className="rounded-lg border px-3 py-2"
            value={form.institution}
            onChange={(event) => updateField("institution", event.target.value)}
          />
        </div>

        <div className="flex flex-col gap-1">
          <label
            htmlFor={`${fieldPrefix}-opening-balance`}
            className="text-sm font-medium text-gray-600"
          >
            Opening balance
          </label>
          <input
            id={`${fieldPrefix}-opening-balance`}
            className="rounded-lg border px-3 py-2"
            type="number"
            step="0.01"
            value={form.openingBalance}
            onChange={(event) =>
              updateField("openingBalance", event.target.value)
            }
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <label
            htmlFor={`${fieldPrefix}-opening-balance-date`}
            className="text-sm font-medium text-gray-600"
          >
            Opening balance date
          </label>
          <input
            id={`${fieldPrefix}-opening-balance-date`}
            className="rounded-lg border px-3 py-2"
            type="date"
            value={form.openingBalanceDate}
            onChange={(event) =>
              updateField("openingBalanceDate", event.target.value)
            }
          />
        </div>

        <div className="flex flex-col gap-1">
          <label
            htmlFor={`${fieldPrefix}-order`}
            className="text-sm font-medium text-gray-600"
          >
            Order
          </label>
          <input
            id={`${fieldPrefix}-order`}
            className="rounded-lg border px-3 py-2"
            type="number"
            value={form.order}
            onChange={(event) => updateField("order", event.target.value)}
          />
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <label
          htmlFor={`${fieldPrefix}-notes`}
          className="text-sm font-medium text-gray-600"
        >
          Notes
        </label>
        <textarea
          id={`${fieldPrefix}-notes`}
          className="min-h-28 rounded-lg border px-3 py-2"
          value={form.notes}
          onChange={(event) => updateField("notes", event.target.value)}
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
            : isCreateMode
              ? "Create Account"
              : "Save Changes"}
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
