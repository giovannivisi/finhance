"use client";

import { useEffect, useId, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { AccountResponse } from "@finhance/shared";
import {
  ASSET_KIND_OPTIONS,
  EXCHANGE_SUFFIXES,
  LIABILITY_KIND_OPTIONS,
} from "@lib/asset-ui";
import { formatAccountOptionLabel } from "@lib/accounts";
import {
  buildAssetPayload,
  ensureKindForType,
  getKindConfig,
  normalizeExchangeInput,
  type AssetFormValues,
} from "@lib/asset-form";
import { api, apiMutation } from "@lib/api";
import { useSingleFlightActions } from "@lib/single-flight";

interface AssetFormProps {
  assetId?: string;
  initialValues: AssetFormValues;
  mode: "create" | "edit";
  onSuccess?: () => void;
}

export default function AssetForm({
  assetId,
  initialValues,
  mode,
  onSuccess,
}: AssetFormProps) {
  const router = useRouter();
  const fieldPrefix = useId();
  const [form, setForm] = useState<AssetFormValues>(initialValues);
  const [accounts, setAccounts] = useState<AccountResponse[]>([]);
  const [accountsError, setAccountsError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const actions = useSingleFlightActions<"submit">();

  const config = getKindConfig(form.type, form.kind);
  const isAsset = form.type === "ASSET";
  const isCreateMode = mode === "create";
  const kindOptions =
    form.type === "LIABILITY" ? LIABILITY_KIND_OPTIONS : ASSET_KIND_OPTIONS;

  useEffect(() => {
    setForm(initialValues);
  }, [initialValues]);

  useEffect(() => {
    let cancelled = false;

    async function loadAccounts() {
      setAccountsError(null);

      try {
        const nextAccounts = await api<AccountResponse[]>("/accounts");
        const selectedAccountId = initialValues.accountId.trim();

        if (
          selectedAccountId &&
          !nextAccounts.some((account) => account.id === selectedAccountId)
        ) {
          const selectedAccount = await api<AccountResponse>(
            `/accounts/${selectedAccountId}`,
          );
          nextAccounts.push(selectedAccount);
        }

        nextAccounts.sort((left, right) => left.order - right.order);

        if (!cancelled) {
          setAccounts(nextAccounts);
        }
      } catch (loadError) {
        if (!cancelled) {
          setAccountsError(
            loadError instanceof Error
              ? loadError.message
              : "Unable to load accounts.",
          );
        }
      }
    }

    void loadAccounts();

    return () => {
      cancelled = true;
    };
  }, [initialValues.accountId]);

  useEffect(() => {
    setForm((previous) => {
      const nextKind = ensureKindForType(previous.type, previous.kind);
      const nextExchange = normalizeExchangeInput(
        previous.type,
        nextKind,
        previous.exchange,
      );

      if (nextKind === previous.kind && nextExchange === previous.exchange) {
        return previous;
      }

      return {
        ...previous,
        kind: nextKind,
        exchange: nextExchange,
      };
    });
  }, [form.exchange, form.kind, form.type]);

  function updateField<Field extends keyof AssetFormValues>(
    field: Field,
    value: AssetFormValues[Field],
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

      const result = buildAssetPayload(form);
      if (!result.payload) {
        setError(result.error ?? "Unable to validate this asset.");
        return;
      }

      if (!isCreateMode && !assetId) {
        setError("Missing asset id for this edit.");
        return;
      }

      setIsSubmitting(true);

      try {
        await apiMutation(isCreateMode ? "/assets" : `/assets/${assetId}`, {
          method: isCreateMode ? "POST" : "PUT",
          body: JSON.stringify(result.payload),
        });

        onSuccess?.();
        router.refresh();
      } catch (submitError) {
        setError(
          submitError instanceof Error
            ? submitError.message
            : isCreateMode
              ? "Error creating asset."
              : "Error updating asset.",
        );
      } finally {
        setIsSubmitting(false);
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="flex flex-col gap-1">
        <label
          htmlFor={`${fieldPrefix}-name`}
          className="text-sm text-gray-600"
        >
          Name
        </label>
        <input
          id={`${fieldPrefix}-name`}
          className="border rounded-lg px-3 py-2"
          value={form.name}
          onChange={(event) => updateField("name", event.target.value)}
          required
        />
      </div>

      <div className="flex flex-col gap-1">
        <label
          htmlFor={`${fieldPrefix}-type`}
          className="text-sm text-gray-600"
        >
          Type
        </label>
        <select
          id={`${fieldPrefix}-type`}
          className="border rounded-lg px-3 py-2"
          value={form.type}
          onChange={(event) =>
            updateField("type", event.target.value as AssetFormValues["type"])
          }
          required
        >
          <option value="ASSET">ASSET</option>
          <option value="LIABILITY">LIABILITY</option>
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label
          htmlFor={`${fieldPrefix}-kind`}
          className="text-sm text-gray-600"
        >
          Kind
        </label>
        <select
          id={`${fieldPrefix}-kind`}
          className="border rounded-lg px-3 py-2"
          value={form.kind}
          onChange={(event) =>
            updateField("kind", event.target.value as AssetFormValues["kind"])
          }
        >
          {kindOptions.map((kind) => (
            <option key={kind} value={kind}>
              {kind}
            </option>
          ))}
        </select>
      </div>

      {config.showBalance ? (
        <div className="flex flex-col gap-1">
          <label
            htmlFor={`${fieldPrefix}-balance`}
            className="text-sm text-gray-600"
          >
            Amount
          </label>
          <input
            id={`${fieldPrefix}-balance`}
            className="border rounded-lg px-3 py-2"
            type="number"
            step="0.01"
            value={form.balance}
            onChange={(event) => updateField("balance", event.target.value)}
            required
          />
        </div>
      ) : null}

      {config.showQuantity ? (
        <div className="flex flex-col gap-1">
          <label
            htmlFor={`${fieldPrefix}-quantity`}
            className="text-sm text-gray-600"
          >
            Quantity
          </label>
          <input
            id={`${fieldPrefix}-quantity`}
            className="border rounded-lg px-3 py-2"
            type="number"
            step="0.0000001"
            value={form.quantity}
            onChange={(event) => updateField("quantity", event.target.value)}
            required
          />
        </div>
      ) : null}

      {config.showUnitPrice ? (
        <div className="flex flex-col gap-1">
          <label
            htmlFor={`${fieldPrefix}-unit-price`}
            className="text-sm text-gray-600"
          >
            Unit Price
          </label>
          <input
            id={`${fieldPrefix}-unit-price`}
            className="border rounded-lg px-3 py-2"
            type="number"
            step="0.0001"
            value={form.unitPrice}
            onChange={(event) => updateField("unitPrice", event.target.value)}
            required
          />
        </div>
      ) : null}

      {config.showTicker ? (
        <>
          <div className="flex flex-col gap-1">
            <label
              htmlFor={`${fieldPrefix}-ticker`}
              className="text-sm text-gray-600"
            >
              Ticker
            </label>
            <input
              id={`${fieldPrefix}-ticker`}
              className="border rounded-lg px-3 py-2"
              value={form.ticker}
              onChange={(event) => updateField("ticker", event.target.value)}
              required
            />
          </div>

          <div className="flex flex-col gap-1">
            <label
              htmlFor={`${fieldPrefix}-exchange`}
              className="text-sm text-gray-600"
            >
              Exchange
            </label>
            <select
              id={`${fieldPrefix}-exchange`}
              className="border rounded-lg px-3 py-2"
              value={form.exchange}
              onChange={(event) => updateField("exchange", event.target.value)}
            >
              {EXCHANGE_SUFFIXES.map((exchange) => (
                <option key={exchange.value} value={exchange.value}>
                  {exchange.label}
                </option>
              ))}
            </select>
          </div>
        </>
      ) : null}

      <div className="flex flex-col gap-1">
        <label
          htmlFor={`${fieldPrefix}-currency`}
          className="text-sm text-gray-600"
        >
          Currency
        </label>
        <input
          id={`${fieldPrefix}-currency`}
          className="border rounded-lg px-3 py-2"
          value={form.currency}
          onChange={(event) => updateField("currency", event.target.value)}
        />
      </div>

      <div className="flex flex-col gap-1">
        <label
          htmlFor={`${fieldPrefix}-account`}
          className="text-sm text-gray-600"
        >
          Account
        </label>
        <select
          id={`${fieldPrefix}-account`}
          className="border rounded-lg px-3 py-2"
          value={form.accountId}
          onChange={(event) => updateField("accountId", event.target.value)}
        >
          <option value="">No account</option>
          {accounts.map((account) => (
            <option key={account.id} value={account.id}>
              {formatAccountOptionLabel(account)}
            </option>
          ))}
        </select>
        {accountsError ? (
          <p className="text-xs text-amber-700">{accountsError}</p>
        ) : null}
      </div>

      <div className="flex flex-col gap-1">
        <label
          htmlFor={`${fieldPrefix}-notes`}
          className="text-sm text-gray-600"
        >
          Notes
        </label>
        <textarea
          id={`${fieldPrefix}-notes`}
          className="border rounded-lg px-3 py-2"
          value={form.notes}
          onChange={(event) => updateField("notes", event.target.value)}
        />
      </div>

      <div className="flex flex-col gap-1">
        <label
          htmlFor={`${fieldPrefix}-order`}
          className="text-sm text-gray-600"
        >
          Order
        </label>
        <input
          id={`${fieldPrefix}-order`}
          className="border rounded-lg px-3 py-2"
          type="number"
          value={form.order}
          onChange={(event) => updateField("order", event.target.value)}
        />
      </div>

      {error ? (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={isSubmitting}
        className="w-full bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isSubmitting
          ? "Saving..."
          : isCreateMode
            ? isAsset
              ? "Create Asset"
              : "Create Liability"
            : "Save Changes"}
      </button>
    </form>
  );
}
