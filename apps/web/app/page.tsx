import Container from "@components/Container";
import Header from "@components/Header";
import { api } from "@lib/api";
import DashboardClient from "@components/DashboardClient";
import { formatCurrency } from "@lib/format";
import { ApiAsset } from "@lib/api-types";

export default async function Home({searchParams,}: { searchParams?: { refresh?: string }; }) {
  const force = searchParams?.refresh === "1" || searchParams?.refresh === "true";
  const assets = await api<ApiAsset[]>(`/assets/with-values${force ? "?refresh=1" : ""}`);
  const summary = await api<{ assets: number; liabilities: number; netWorth: number }>(
    `/assets/summary${force ? "?refresh=1" : ""}`
  );
  const assetList = assets.filter(a => a.type === "ASSET");
  const liabilityList = assets.filter(a => a.type === "LIABILITY");

  const lastUpdatedMs = assets
    .map(a => (a.lastPriceAt ? Date.parse(a.lastPriceAt) : NaN))
    .filter(ms => Number.isFinite(ms))
    .reduce((max, ms) => Math.max(max, ms), 0);

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

  const kindTotals = assetList.reduce((acc, asset) => {
    const value = Number(asset.currentValue ?? asset.balance ?? 0);

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
          lastUpdatedMs={lastUpdatedMs || null}
        />

      </Container>
    </>
  );
}