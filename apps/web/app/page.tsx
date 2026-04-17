import Container from "./components/Container";
import Header from "./components/Header";
import type {
  DashboardAssetResponse,
  DashboardResponse,
} from "@finhance/shared";
import { api } from "../lib/api";
import DashboardClient from "./components/DashboardClient";
import { formatCurrency } from "../lib/format";
import { Card, CardContent } from "@repo/ui/card";

export const dynamic = "force-dynamic";

export default async function Home() {
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
      <>
        <Header />
        <Container>
          <div className="pt-12 md:pt-24 space-y-6">
            <h2 className="text-display-md font-heading font-extrabold tracking-tight">
              Dashboard unavailable
            </h2>
            <Card className="bg-tertiary/10">
              <CardContent className="p-8">
                <p className="font-heading font-medium text-lg text-onSurface">
                  The web app could not reach the API.
                </p>
                <p className="mt-2 text-onSurfaceVariant">
                  {errorMessage ?? "Start the API and refresh the page."}
                </p>
              </CardContent>
            </Card>
          </div>
        </Container>
      </>
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

  return (
    <>
      <Header />
      <Container>
        <div className="space-y-12">
          {/* Main Summary Section */}
          <div className="flex flex-col gap-6 md:gap-12 md:flex-row md:items-end md:justify-between py-6">
            <div className="space-y-2">
              <h2 className="font-heading font-extrabold tracking-[-0.04em] text-5xl md:text-7xl text-onSurface">
                {formatCurrency(
                  dashboard.summary.netWorth,
                  dashboard.baseCurrency,
                )}
              </h2>
              <p className="text-onSurfaceVariant font-sans text-lg font-medium tracking-wide uppercase ml-1">
                Total Net Worth
              </p>
            </div>

            <div className="flex gap-4 md:gap-8">
              <div className="flex flex-col">
                <p className="text-sm font-sans tracking-widest text-onSurfaceVariant uppercase mb-1">
                  Assets
                </p>
                <p className="text-secondary font-heading text-2xl md:text-3xl font-bold tracking-tight">
                  {formatCurrency(
                    dashboard.summary.assets,
                    dashboard.baseCurrency,
                  )}
                </p>
              </div>
              <div className="flex flex-col">
                <p className="text-sm font-sans tracking-widest text-onSurfaceVariant uppercase mb-1">
                  Liabilities
                </p>
                <p className="text-tertiary font-heading text-2xl md:text-3xl font-bold tracking-tight">
                  {formatCurrency(
                    dashboard.summary.liabilities,
                    dashboard.baseCurrency,
                  )}
                </p>
              </div>
            </div>
          </div>

          <DashboardClient
            grouped={grouped}
            kindTotalsArray={kindTotalsArray}
            baseCurrency={dashboard.baseCurrency}
            lastRefreshAt={dashboard.lastRefreshAt}
          />
        </div>
      </Container>
    </>
  );
}
