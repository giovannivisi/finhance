"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function EditAccountForm({ account, categories }: { account: any; categories: any[] }) {
  const router = useRouter();

  const [name, setName] = useState(account.name);
  const [type, setType] = useState(account.type);
  const [balance, setBalance] = useState(account.balance);
  const [currency, setCurrency] = useState(account.currency);
  const [categoryId, setCategoryId] = useState(account.categoryId || "");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const res = await fetch(
      `${process.env.NEXT_PUBLIC_API_URL}/accounts/${account.id}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          type,
          balance: Number(balance),
          currency,
          categoryId: categoryId || null,
        }), 
      }
    );

    if (!res.ok) {
      alert("Error updating account");
      return;
    }

    router.push("/");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} style={{ marginTop: 20 }}>
      <div>
        <label className="text-sm text-gray-600">Name: </label>
        <input
          className="border rounded px-2 py-1"
          value={name}
          onChange={e => setName(e.target.value)}
          required
        />
      </div>

      <div>
        <label className="text-sm text-gray-600">Type: </label>
        <select
          className="border rounded px-2 py-1"
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
          className="border rounded px-2 py-1"
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

      <div>
        <label className="text-sm text-gray-600">Balance: </label>
        <input
          className="border rounded px-2 py-1"
          type="number"
          step="0.01"
          value={balance}
          onChange={e => setBalance(e.target.value)}
          required
        />
      </div>

      <div>
        <label className="text-sm text-gray-600">Currency: </label>
        <input
          className="border rounded px-2 py-1"
          value={currency}
          onChange={e => setCurrency(e.target.value)}
        />
      </div>

      <button
        type="submit"
        className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
        style={{ marginTop: 20 }}
      > 
        Save Changes
      </button>
    </form>
  );
}