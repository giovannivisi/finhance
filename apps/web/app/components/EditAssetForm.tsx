"use client";

import { useState } from "react";
import { ASSET_KIND_CONFIG, EXCHANGE_SUFFIXES, LIABILITY_CONFIG } from "@lib/api-types";

export default function EditAssetForm({
  asset,
  onSuccess,
}: {
  asset: any;
  onSuccess?: () => void;
}) {
  const toInputString = (v: any) => {
    if (v === null || v === undefined) return "";
    if (typeof v === "string" || typeof v === "number") return String(v);
    // Prisma Decimal or similar objects often implement toString()
    try {
      const s = v.toString?.();
      return typeof s === "string" && s !== "[object Object]" ? s : "";
    } catch {
      return "";
    }
  };

  const [name, setName] = useState(asset.name);
  const [type, setType] = useState(asset.type);
  const [currency, setCurrency] = useState(asset.currency);
  const [kind, setKind] = useState(asset.type === "LIABILITY"
                                      ? asset.liabilityKind ?? ""
                                      : asset.kind ?? ""
                                  );
  const [ticker, setTicker] = useState(asset.ticker ?? "");
  const [quantity, setQuantity] = useState(toInputString(asset.quantity));
  const [unitPrice, setUnitPrice] = useState(toInputString(asset.unitPrice));
  const [notes, setNotes] = useState(asset.notes ?? "");
  const [order, setOrder] = useState(asset.order != null ? String(asset.order) : "");
  const [exchange, setExchange] = useState(asset.exchange ?? "");


  const isAsset = type === "ASSET";
  const isLiability = type === "LIABILITY";
  const config = isAsset
    ? ASSET_KIND_CONFIG[kind as keyof typeof ASSET_KIND_CONFIG] ?? ASSET_KIND_CONFIG["CASH"]
    : LIABILITY_CONFIG[kind as keyof typeof LIABILITY_CONFIG] ?? LIABILITY_CONFIG["TAX"];
  const [balance, setBalance] = useState(toInputString(asset.balance));
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const trimmedTicker = ticker.trim();

    if (isLiability && balance.trim() === "") {
      alert("Please enter an amount for the liability.");
      return;
    }

    if (!isLiability) {
      if (config.showTicker && trimmedTicker === "") {
        alert("Please enter a ticker.");
        return;
      }
      if (config.showQuantity && quantity.trim() === "") {
        alert("Please enter a quantity.");
        return;
      }
      if (config.showUnitPrice && unitPrice.trim() === "") {
        alert("Please enter an average buy-in price.");
        return;
      }
      if (config.showBalance && balance.trim() === "") {
        alert("Please enter an amount.");
        return;
      }
    }

    const res = await fetch(
      `${process.env.NEXT_PUBLIC_API_URL}/assets/${asset.id}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          type: isLiability ? "LIABILITY" : "ASSET",
          currency,
          kind: isLiability ? null : kind,
          liabilityKind: isLiability ? kind : null,
          ticker: isLiability ? null : (config.showTicker ? ticker || null : null),
          exchange: isLiability ? null : (config.showTicker ? exchange : null),
          quantity: isLiability
            ? null
            : (config.showQuantity && quantity !== "" && Number.isFinite(parseFloat(quantity))
                ? parseFloat(quantity)
                : null),
          unitPrice: isLiability
            ? null
            : (config.showUnitPrice && unitPrice !== "" && Number.isFinite(parseFloat(unitPrice))
                ? parseFloat(unitPrice)
                : null),
          balance: isLiability
            ? (balance !== "" && Number.isFinite(parseFloat(balance)) ? parseFloat(balance) : 0)
            : (config.showBalance
                ? (balance !== "" && Number.isFinite(parseFloat(balance)) ? parseFloat(balance) : 0)
                : (quantity !== "" && unitPrice !== ""
                    ? parseFloat(quantity) * parseFloat(unitPrice)
                    : 0)),
          notes: notes || null,
          order: order ? Number(order) : null,
        }),
      }
    );

    if (!res.ok) {
      const text = await res.text();
      alert(text || "Error updating asset");
      return;
    }

    if (onSuccess) onSuccess();
    window.location.reload();
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white p-6 rounded-2xl space-y-6">
      <div className="flex flex-col gap-1">
        <label className="text-sm text-gray-600">Name</label>
        <input
          className="border rounded-lg px-3 py-2"
          value={name}
          onChange={e => setName(e.target.value)}
          required
        />
      </div>

      {isLiability && (
        <div className="flex flex-col gap-1">
          <label className="text-sm text-gray-600">Kind</label>
          <select
            className="border rounded-lg px-3 py-2"
            value={kind || ""}
            onChange={(e) => setKind(e.target.value)}
          >
            <option value="TAX">TAX</option>
            <option value="DEBT">DEBT</option>
            <option value="OTHER">OTHER</option>
          </select>
        </div>
      )}

      {isAsset && (
        <div className="flex flex-col gap-1">
          <label className="text-sm text-gray-600">Kind</label>
          <select
            className="border rounded-lg px-3 py-2"
            value={kind || ""}
            onChange={(e) => setKind(e.target.value)}
          >
            <option value="CASH">CASH</option>
            <option value="STOCK">STOCK</option>
            <option value="BOND">BOND</option>
            <option value="CRYPTO">CRYPTO</option>
            <option value="REAL_ESTATE">REAL_ESTATE</option>
            <option value="PENSION">PENSION</option>
            <option value="COMMODITY">COMMODITY</option>
            <option value="OTHER">OTHER</option>
          </select>
        </div>
      )}

      {config.showBalance && (
        <div className="flex flex-col gap-1">
          <label className="text-sm text-gray-600">Amount</label>
          <input
            className="border rounded-lg px-3 py-2"
            type="number"
            step="0.01"
            value={balance}
            onChange={(e) => setBalance(e.target.value)}
          />
        </div>
      )}

      {config.showTicker && (
        <div className="flex flex-col gap-1">
          <label className="text-sm text-gray-600">Ticker</label>
          <input
            className="border rounded-lg px-3 py-2"
            value={ticker}
            onChange={(e) => setTicker(e.target.value)}
          />
        </div>
      )}

      {config.showTicker && (
        <div className="flex flex-col gap-1">
          <label className="text-sm text-gray-600">Exchange</label>
          <select
            className="border rounded-lg px-3 py-2"
            value={exchange}
            onChange={e => setExchange(e.target.value)}
          >
            {EXCHANGE_SUFFIXES.map(ex => (
              <option key={ex.value} value={ex.value}>
                {ex.label}
              </option>
            ))}
          </select>
        </div>
      )}

      {config.showQuantity && (
        <div className="flex flex-col gap-1">
          <label className="text-sm text-gray-600">Quantity</label>
          <input
            className="border rounded-lg px-3 py-2"
            type="number"
            step="0.0000001"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
          />
        </div>
      )}

      {config.showUnitPrice && (
        <div className="flex flex-col gap-1">
          <label className="text-sm text-gray-600">Unit Price</label>
          <input
            className="border rounded-lg px-3 py-2"
            type="number"
            step="0.0001"
            value={unitPrice}
            onChange={(e) => setUnitPrice(e.target.value)}
          />
        </div>
      )}

      <div className="flex flex-col gap-1">
        <label className="text-sm text-gray-600">Notes</label>
        <textarea
          className="border rounded-lg px-3 py-2"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-sm text-gray-600">Order</label>
        <input
          className="border rounded-lg px-3 py-2"
          type="number"
          value={order}
          onChange={(e) => setOrder(e.target.value)}
        />
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-sm text-gray-600">Currency</label>
        <input
          className="border rounded-lg px-3 py-2"
          value={currency}
          onChange={e => setCurrency(e.target.value)}
        />
      </div>

      <button type="submit" className="w-full bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700">
        Save Changes
      </button>
    </form>
  );
}