"use client";

import { useState } from "react";
import { ASSET_KIND_CONFIG, LIABILITY_CONFIG } from "@lib/api-types";


export default function CreateAssetForm({ onSuccess }: {  onSuccess?: () => void }) {
  const [name, setName] = useState("");
  const [type, setType] = useState("ASSET");
  const [balance, setBalance] = useState("");
  const [currency, setCurrency] = useState("EUR");
  const [categoryId, setCategoryId] = useState("");
  const [kind, setKind] = useState("CASH");
  const [ticker, setTicker] = useState("");
  const [quantity, setQuantity] = useState("");
  const [unitPrice, setUnitPrice] = useState("");
  const [notes, setNotes] = useState("");
  const [order, setOrder] = useState("");


  const isAsset = type === "ASSET";
  const config = isAsset
    ? ASSET_KIND_CONFIG[kind as keyof typeof ASSET_KIND_CONFIG] ?? ASSET_KIND_CONFIG["CASH"]
    : LIABILITY_CONFIG[kind as keyof typeof LIABILITY_CONFIG] ?? LIABILITY_CONFIG["TAX"];

  const isLiability = type === "LIABILITY";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/assets`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        type,
        currency,
        categoryId: categoryId || null,
        ticker: isLiability ? null : (config.showTicker ? ticker || null : null),
        quantity: isLiability ? null : (config.showQuantity && quantity ? Number(quantity) : null),
        unitPrice: isLiability ? null : (config.showUnitPrice && unitPrice ? Number(unitPrice) : null),
        balance: isLiability
          ? Number(balance) // required
          : (config.showBalance ? (balance ? Number(balance) : null) : null),
        kind: isLiability ? null : kind,
        liabilityKind: isLiability ? kind : null,
        notes: notes || null,
        order: order ? Number(order) : null,
      }),
    });

    if (!res.ok) {
      alert("Error creating asset");
      return;
    }

    // Refresh the page so new asset shows up
    if (onSuccess) onSuccess();
    window.location.reload();
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white p-6 rounded-2xl space-y-6">
      {isAsset && (
        <h2>Create Asset</h2>
      )}
      {isLiability && (
        <h2>Create Liability</h2>
      )}

      <div className="flex flex-col gap-1">
        <label className="text-sm text-gray-600">Name</label>
        <input
          className="border rounded-lg px-3 py-2"
          value={name}
          onChange={e => setName(e.target.value)}
          required
        />
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-sm text-gray-600">Type</label>
        <select
          className="border rounded-lg px-3 py-2"
          value={type}
          onChange={e => setType(e.target.value)}
          required
        >
          <option value="ASSET">ASSET</option>
          <option value="LIABILITY">LIABILITY</option>
        </select>
      </div>

      {isLiability && (
        <div className="flex flex-col gap-1">
          <label className="text-sm text-gray-600">Kind</label>
          <select
            className="border rounded-lg px-3 py-2"
            value={kind}
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
            value={kind}
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

      <div className="flex flex-col gap-1">
        <label className="text-sm text-gray-600">Currency</label>
        <input
          className="border rounded-lg px-3 py-2"
          value={currency}
          onChange={e => setCurrency(e.target.value)}
        />
      </div>

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

      {isAsset && (
      <button
        type="submit"
        className="w-full bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
      >
        Create Asset
      </button>
      )}

      {isLiability && (
      <button
        type="submit"
        className="w-full bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
      >
        Create Liability
      </button>
      )}
    </form>
  );
}