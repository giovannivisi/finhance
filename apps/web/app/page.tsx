import { api } from "@lib/api";
import CreateAccountForm from "@components/CreateAccountForm";
import DeleteAccountButton from "@components/DeleteAccountButton";

export default async function Home() {
  const accounts = await api<any[]>("/accounts");
  const summary = await api<{ assets: number; liabilities: number; netWorth: number }>("/accounts/summary");

  return (
    <div style={{ padding: 20 }}>
      <h1>Finhance Dashboard</h1>

      <CreateAccountForm />

      <h2>Summary</h2>
      <p>Assets: {summary.assets}</p>
      <p>Liabilities: {summary.liabilities}</p>
      <p>Net Worth: {summary.netWorth}</p>

      <h2>Accounts</h2>
      <ul>
        {accounts.map(acc => (
          <li key={acc.id}>
            {acc.name} — {acc.type} — {acc.balance}

            {" "}
            <a href={`/accounts/${acc.id}/edit`} style={{ marginLeft: 10 }}>
              ✎ Edit
            </a>

            <DeleteAccountButton id={acc.id} />
          </li>
        ))}
      </ul>
    </div>
  );
}