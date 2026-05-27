import type {
  DashboardAssetResponse,
  DashboardResponse,
} from "@finhance/shared";
import Container from "@components/Container";
import DashboardClient from "@components/DashboardClient";
import DashboardSupportDataClient from "@components/DashboardSupportDataClient";
import { api } from "@lib/server-api";

export default async function DashboardRouteContent() {
  let dashboard: DashboardResponse | null = null;
  let errorMessage: string | null = null;

  try {
    dashboard = await api<DashboardResponse>("/dashboard");
  } catch (error) {
    errorMessage =
      error instanceof Error
        ? error.message
        : "Dashboard data is currently unavailable.";
  }

  if (!dashboard) {
    return (
      <Container>
        <h2 className="text-2xl font-semibold">Dashboard unavailable</h2>
        <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-6 text-amber-950">
          <p className="font-medium">The web app could not reach the API.</p>
          <p className="mt-2 text-sm text-amber-900/80">
            {errorMessage ?? "Start the API and refresh the page."}
          </p>
        </div>
      </Container>
    );
  }

  const assets = dashboard.assets;
  const assetList = assets.filter((asset) => asset.type === "ASSET");
  const grouped: Record<string, DashboardAssetResponse[]> = assets.reduce(
    (acc, asset) => {
      const groupKey =
        asset.type === "ASSET"
          ? asset.kind || "Unassigned"
          : asset.liabilityKind || "Unassigned";
      if (!acc[groupKey]) acc[groupKey] = [];
      acc[groupKey].push(asset);
      return acc;
    },
    {} as Record<string, DashboardAssetResponse[]>,
  );

  const kindTotals = assetList.reduce(
    (acc, asset) => {
      const value = asset.currentValue ?? asset.referenceValue ?? null;

      if (value !== null) {
        const kind = asset.kind ?? "Unassigned";
        acc[kind] = (acc[kind] || 0) + value;
      }
      return acc;
    },
    {} as Record<string, number>,
  );

  const kindTotalsArray = Object.entries(kindTotals)
    .map(([kind, total]) => ({
      kind,
      total,
    }))
    .sort((left, right) => right.total - left.total);
  const brokerageAccountIds = new Set(
    assets
      .filter((asset) => asset.accountType === "BROKER" && asset.accountId)
      .map((asset) => asset.accountId as string),
  );

  return (
    <Container>
      <h2 className="home-summary-title">Summary</h2>

      <DashboardClient
        grouped={grouped}
        kindTotalsArray={kindTotalsArray}
        baseCurrency={dashboard.reportingCurrency}
        pricingStatus={dashboard.pricingStatus}
        lastRefreshAt={dashboard.lastRefreshAt}
        summary={dashboard.summary}
        assetKindOrder={dashboard.assetKindOrder}
        brokerageAccountIds={[...brokerageAccountIds]}
      />

      <DashboardSupportDataClient />
    </Container>
  );
}
