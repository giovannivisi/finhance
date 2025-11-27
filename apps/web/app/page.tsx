import Container from "@components/Container";
import Header from "@components/Header";
import { api } from "@lib/api";
import DashboardClient from "@components/DashboardClient";
import { formatCurrency } from "@lib/format";

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
  const categoryTotals = Object.entries(grouped).map(([category, items]) => {
    const total = items.reduce(
      (sum, acc) =>
        sum +
        (acc.type === "LIABILITY" ? -Number(acc.balance) : Number(acc.balance)),
      0
    );
  return { category, total };
});
  categoryTotals.sort((a, b) => b.total - a.total);
  const summary = await api<{ assets: number; liabilities: number; netWorth: number }>("/accounts/summary");
  const categories = await api<any[]>("/categories");

  return (
    <>
      <Header />
      <Container>
        <h2 className="text-2xl font-semibold">Summary</h2>

        <div className="grid grid-cols-3 gap-4">
          <div className="bg-white shadow rounded-2xl p-4 text-center">
            <p className="text-sm text-gray-500">Assets</p>
            <p className="text-green-600 text-xl font-bold">{formatCurrency(summary.assets)}</p>
          </div>
          <div className="bg-white shadow rounded-2xl p-4 text-center">
            <p className="text-sm text-gray-500">Liabilities</p>
            <p className="text-red-600 text-xl font-bold">{formatCurrency(summary.liabilities)}</p>
          </div>
          <div className="bg-white shadow rounded-2xl p-4 text-center">
            <p className="text-sm text-gray-500">Net Worth</p>
            <p className="text-black text-xl font-bold">{formatCurrency(summary.netWorth)}</p>
          </div>
        </div>

        <DashboardClient
          grouped={grouped}
          categories={categories}
          categoryTotals={categoryTotals}
        />

      </Container>
    </>
  );
}