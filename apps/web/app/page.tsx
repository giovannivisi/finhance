import Container from "@components/Container";
import Header from "@components/Header";
import CreateAccountForm from "@components/CreateAccountForm";
import DeleteAccountButton from "@components/DeleteAccountButton";
import { api } from "@lib/api";
import DashboardClient from "@components/DashboardClient";

export default async function Home() {
  const accounts = await api<any[]>("/accounts");
  type Account = {
    id: string;
    name: string;
    type: string;
    balance: number;
    category?: { name: string } | null;
    // You can add more fields if needed
  };
  const grouped: Record<string, Account[]> = accounts.reduce(
    (acc: Record<string, Account[]>, account: Account) => {
      const categoryName = account.category?.name || "Unassigned";
      if (!acc[categoryName]) acc[categoryName] = [];
      acc[categoryName].push(account);
      return acc;
    },
    {}
  );
  const summary = await api<{ assets: number; liabilities: number; netWorth: number }>("/accounts/summary");
  const categories = await api<any[]>("/categories");
  const sortedCategories = Object.keys(grouped).sort();

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

        <CreateAccountForm categories={categories} />

        <h2 className="text-2xl font-semibold mt-6">Accounts</h2>

        <DashboardClient grouped={grouped} categories={categories} />

      </Container>
    </>
  );
}