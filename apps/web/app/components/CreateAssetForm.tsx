"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { EXCHANGE_SUFFIXES } from "@lib/api-types";
import {
  buildAssetPayload,
  createEmptyAssetFormValues,
  ensureKindForType,
  getKindConfig,
  normalizeExchangeInput,
  type AssetFormValues,
} from "@lib/asset-form";
import { getApiUrl, readApiError } from "@lib/api";

export default function CreateAssetForm({ onSuccess }: { onSuccess?: () => void }) {
  const router = useRouter();
  const [form, setForm] = useState<AssetFormValues>(createEmptyAssetFormValues());
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const config = getKindConfig(form.type, form.kind);
  const isAsset = form.type === "ASSET";
  const isLiability = form.type === "LIABILITY";

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
  }, [form.type, form.kind, form.exchange]);

  function updateField<Field extends keyof AssetFormValues>(field: Field, value: AssetFormValues[Field]) {
    setForm((previous) => ({
      ...previous,
      [field]: value,
    }));
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    const result = buildAssetPayload(form);
    if (!result.payload) {
      setError(result.error ?? "Unable to validate this asset.");
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch(getApiUrl("/assets"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(result.payload),
      });

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
          : "Error creating asset.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white p-6 rounded-2xl space-y-6">
      <h2>{isAsset ? "Create Asset" : "Create Liability"}</h2>

      <div className="flex flex-col gap-1">
        <label className="text-sm text-gray-600">Name</label>
        <input
          className="border rounded-lg px-3 py-2"
          value={form.name}
          onChange={(event) => updateField("name", event.target.value)}
          required
        />
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-sm text-gray-600">Type</label>
        <select
          className="border rounded-lg px-3 py-2"
          value={form.type}
          onChange={(event) => updateField("type", event.target.value as AssetFormValues["type"])}
          required
        >
          <option value="ASSET">ASSET</option>
          <option value="LIABILITY">LIABILITY</option>
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-sm text-gray-600">Kind</label>
        <select
          className="border rounded-lg px-3 py-2"
          value={form.kind}
          onChange={(event) => updateField("kind", event.target.value)}
        >
          {isLiability ? (
            <>
              <option value="TAX">TAX</option>
              <option value="DEBT">DEBT</option>
              <option value="OTHER">OTHER</option>
            </>
          ) : (
            <>
              <option value="CASH">CASH</option>
              <option value="STOCK">STOCK</option>
              <option value="BOND">BOND</option>
              <option value="CRYPTO">CRYPTO</option>
              <option value="REAL_ESTATE">REAL_ESTATE</option>
              <option value="PENSION">PENSION</option>
              <option value="COMMODITY">COMMODITY</option>
              <option value="OTHER">OTHER</option>
            </>
          )}
        </select>
      </div>

      {config.showBalance ? (
        <div className="flex flex-col gap-1">
          <label className="text-sm text-gray-600">Amount</label>
          <input
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
          <label className="text-sm text-gray-600">Quantity</label>
          <input
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
          <label className="text-sm text-gray-600">Unit Price</label>
          <input
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
            <label className="text-sm text-gray-600">Ticker</label>
            <input
              className="border rounded-lg px-3 py-2"
              value={form.ticker}
              onChange={(event) => updateField("ticker", event.target.value)}
              required
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-sm text-gray-600">Exchange</label>
            <select
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
        <label className="text-sm text-gray-600">Currency</label>
        <input
          className="border rounded-lg px-3 py-2"
          value={form.currency}
          onChange={(event) => updateField("currency", event.target.value)}
        />
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-sm text-gray-600">Notes</label>
        <textarea
          className="border rounded-lg px-3 py-2"
          value={form.notes}
          onChange={(event) => updateField("notes", event.target.value)}
        />
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-sm text-gray-600">Order</label>
        <input
          className="border rounded-lg px-3 py-2"
          type="number"
          value={form.order}
          onChange={(event) => updateField("order", event.target.value)}
        />
      </div>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      <button
        type="submit"
        disabled={isSubmitting}
        className="w-full bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isSubmitting
          ? "Saving..."
          : isAsset
            ? "Create Asset"
            : "Create Liability"}
      </button>
    </form>
  );
}
