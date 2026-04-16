import Container from "@components/Container";
import Header from "@components/Header";
import { api } from "@lib/api";
import DashboardClient from "@components/DashboardClient";
import { formatCurrency } from "@lib/format";
import { ApiAsset, DashboardResponse } from "@lib/api-types";

export const dynamic = "force-dynamic";

export default async function Home() {
  let dashboard: DashboardResponse | null = null;
  let errorMessage: string | null = null;

  try {
    dashboard = await api<DashboardResponse>("/dashboard");
  } catch (error) {
    errorMessage =
      error instanceof Error ? error.message : "Dashboard data is currently unavailable.";
  }

  if (!dashboard) {
    return (
      <>
        <Header />
        <Container>
          <h2 className="text-2xl font-semibold">Dashboard unavailable</h2>
          <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-6 text-amber-950">
            <p className="font-medium">The web app could not reach the API.</p>
            <p className="mt-2 text-sm text-amber-900/80">
              {errorMessage ?? "Start the API and refresh the page."}
            </p>
          </div>
        </Container>
      </>
    );
  }

  const assets = dashboard.assets;
  const assetList = assets.filter((asset) => asset.type === "ASSET");
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
    const value = asset.currentValue ?? asset.referenceValue ?? null;

    if (value !== null) {
      const kind = asset.kind ?? "Unassigned";
      acc[kind] = (acc[kind] || 0) + value;
    }
    return acc;
  }, {} as Record<string, number>);
  
  const kindTotalsArray = Object.entries(kindTotals)
    .map(([kind, total]) => ({
      kind,
      total,
    }))
    .sort((left, right) => right.total - left.total);

  return (
    <>
      <Header />
      <Container>
        <h2 className="text-2xl font-semibold">Summary</h2>

        <div className="grid grid-cols-3 gap-4">
          <div className="bg-white shadow rounded-2xl p-4 text-center">
            <p className="text-sm text-gray-500">Assets</p>
            <p className="text-green-600 text-xl font-bold">
              {formatCurrency(dashboard.summary.assets, dashboard.baseCurrency)}
            </p>
          </div>
          <div className="bg-white shadow rounded-2xl p-4 text-center">
            <p className="text-sm text-gray-500">Liabilities</p>
            <p className="text-red-600 text-xl font-bold">
              {formatCurrency(dashboard.summary.liabilities, dashboard.baseCurrency)}
            </p>
          </div>
          <div className="bg-white shadow rounded-2xl p-4 text-center">
            <p className="text-sm text-gray-500">Net Worth</p>
            <p className="text-black text-xl font-bold">
              {formatCurrency(dashboard.summary.netWorth, dashboard.baseCurrency)}
            </p>
          </div>
        </div>

        <DashboardClient
          grouped={grouped}
          kindTotalsArray={kindTotalsArray}
          baseCurrency={dashboard.baseCurrency}
          lastRefreshAt={dashboard.lastRefreshAt}
        />

      </Container>
    </>
  );
}
