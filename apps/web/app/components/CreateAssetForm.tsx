"use client";

import { useState } from "react";

export default function CreateAssetForm({ categories, onSuccess }: { categories: any[], onSuccess?: () => void }) {
  const [name, setName] = useState("");
  const [type, setType] = useState("ASSET");
  const [balance, setBalance] = useState("");
  const [currency, setCurrency] = useState("EUR");
  const [categoryId, setCategoryId] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/assets`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        type,
        balance: Number(balance),
        currency,
        categoryId: categoryId || null,
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
      <h2>Create Asset</h2>

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

      <div className="flex flex-col gap-1">
        <label className="text-sm text-gray-600">Category</label>
        <select
          className="border rounded-lg px-3 py-2"
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value)}
        >
          <option value="">No category</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-sm text-gray-600">Balance</label>
        <input
          className="border rounded-lg px-3 py-2"
          type="number"
          step="0.01"
          value={balance}
          onChange={e => setBalance(e.target.value)}
          required
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

      <button
        type="submit"
        className="w-full bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
      >
        Create Asset
      </button>
    </form>
  );
}