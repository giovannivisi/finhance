import Container from "@components/Container";
import Header from "@components/Header";
import CreateAccountForm from "@components/CreateAccountForm";
import DeleteAccountButton from "@components/DeleteAccountButton";
import { api } from "@lib/api";

export default async function Home() {
  const accounts = await api<any[]>("/accounts");
  const summary = await api<{ assets: number; liabilities: number; netWorth: number }>("/accounts/summary");

  return (
    <>
      <Header />
      <Container>
        <h2 className="text-2xl font-semibold">Summary</h2>

        <div className="grid grid-cols-3 gap-4">
          <div className="bg-white shadow rounded p-4">
            <p className="text-sm text-gray-500">Assets</p>
            <p className="text-xl font-bold">{summary.assets}</p>
          </div>
          <div className="bg-white shadow rounded p-4">
            <p className="text-sm text-gray-500">Liabilities</p>
            <p className="text-xl font-bold">{summary.liabilities}</p>
          </div>
          <div className="bg-white shadow rounded p-4">
            <p className="text-sm text-gray-500">Net Worth</p>
            <p className="text-xl font-bold">{summary.netWorth}</p>
          </div>
        </div>

        <CreateAccountForm />

        <h2 className="text-2xl font-semibold">Accounts</h2>
        <ul className="space-y-2">
          {accounts.map(acc => (
            <li
              key={acc.id}
              className="bg-white shadow rounded p-4 flex items-center justify-between"
            >
              <div>
                <p className="font-medium">{acc.name}</p>
                <p className="text-sm text-gray-500">{acc.type} — {acc.balance}</p>
              </div>

              <div className="flex items-center gap-3">
                <a
                  href={`/accounts/${acc.id}/edit`}
                  className="text-blue-600 hover:underline"
                >
                  Edit
                </a>
                <DeleteAccountButton id={acc.id} />
              </div>
            </li>
          ))}
        </ul>
      </Container>
    </>
  );
}