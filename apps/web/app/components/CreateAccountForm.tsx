"use client";

import { useState } from "react";

export default function CreateAccountForm() {
  const [name, setName] = useState("");
  const [type, setType] = useState("ASSET");
  const [balance, setBalance] = useState("");
  const [currency, setCurrency] = useState("EUR");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/accounts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        type,
        balance: Number(balance),
        currency,
      }),
    });

    if (!res.ok) {
      alert("Error creating account");
      return;
    }

    // Refresh the page so new account shows up
    window.location.reload();
  }

  return (
    <form onSubmit={handleSubmit} style={{ marginBottom: 40 }}>
      <h2>Create Account</h2>

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

      <button type="submit">Create</button>
    </form>
  );
}