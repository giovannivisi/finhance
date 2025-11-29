import Container from "@components/Container";
import Header from "@components/Header";
import { api } from "@lib/api";
import DashboardClient from "@components/DashboardClient";
import { formatCurrency } from "@lib/format";
import { ApiAsset } from "@lib/api-types";

export default async function Home() {
  const assets = await api<ApiAsset[]>("/assets");
  const assetList = assets.filter(a => a.type === "ASSET");
  const liabilityList = assets.filter(a => a.type === "LIABILITY");

  const grouped: Record<string, ApiAsset[]> = assets.reduce(
    (acc, asset) => {
      const groupKey = asset.type === "ASSET"
        ? asset.kind || "Unassigned"
        : asset.liabilityKind || "Unassigned";
      if (!acc[groupKey]) acc[groupKey] = [];
      acc[groupKey].push(asset);
      return acc;
    },
    {} as Record<string, ApiAsset[]>
  );

  const summary = await api<{ assets: number; liabilities: number; netWorth: number }>("/assets/summary");
  const categories = await api<any[]>("/categories");

  const kindTotals = assetList.reduce((acc, asset) => {
    const value =
      asset.quantity && asset.unitPrice
        ? asset.quantity * asset.unitPrice
        : Number(asset.balance);

    const kind = asset.kind ?? "Unassigned";
    acc[kind] = (acc[kind] || 0) + value;
    return acc;
  }, {} as Record<string, number>);
  
  const kindTotalsArray = Object.entries(kindTotals).map(([kind, total]) => ({
    kind,
    total,
  }));

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
          kindTotalsArray={kindTotalsArray}
          liabilities={liabilityList}
        />

      </Container>
    </>
  );
}