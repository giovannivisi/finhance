import { api } from "../lib/api";

export default async function Home() {
  const accounts = await api<any[]>("/accounts");
  const summary = await api<{ assets: number; liabilities: number; netWorth: number }>("/accounts/summary");

  return (
    <div style={{ padding: 20 }}>
      <h1>Finhance Dashboard</h1>

      <h2>Summary</h2>
      <p>Assets: {summary.assets}</p>
      <p>Liabilities: {summary.liabilities}</p>
      <p>Net Worth: {summary.netWorth}</p>

      <h2>Accounts</h2>
      <ul>
        {accounts.map(acc => (
          <li key={acc.id}>
            {acc.name} — {acc.type} — {acc.balance}
          </li>
        ))}
      </ul>
    </div>
  );
}