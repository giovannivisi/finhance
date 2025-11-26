"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function EditAccountForm({ account }: { account: any }) {
  const router = useRouter();

  const [name, setName] = useState(account.name);
  const [type, setType] = useState(account.type);
  const [balance, setBalance] = useState(account.balance);
  const [currency, setCurrency] = useState(account.currency);

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
        <label>Name: </label>
        <input
          value={name}
          onChange={e => setName(e.target.value)}
          required
        />
      </div>

      <div>
        <label>Type: </label>
        <select value={type} onChange={e => setType(e.target.value)}>
          <option value="ASSET">ASSET</option>
          <option value="LIABILITY">LIABILITY</option>
        </select>
      </div>

      <div>
        <label>Balance: </label>
        <input
          type="number"
          step="0.01"
          value={balance}
          onChange={e => setBalance(e.target.value)}
          required
        />
      </div>

      <div>
        <label>Currency: </label>
        <input
          value={currency}
          onChange={e => setCurrency(e.target.value)}
        />
      </div>

      <button type="submit" style={{ marginTop: 20 }}>
        Save Changes
      </button>
    </form>
  );
}