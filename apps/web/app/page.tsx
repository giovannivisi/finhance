import Container from "./components/Container";

import type {
  DashboardAssetResponse,
  DashboardResponse,
} from "@finhance/shared";
import { api } from "../lib/api";
import DashboardClient from "./components/DashboardClient";

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
        <Container>
          <div className="pt-12 md:pt-24 space-y-6">
            <h2 className="text-display-md font-heading font-extrabold tracking-tight">
              Dashboard unavailable
            </h2>
            <div
              className="glass-card"
              style={{
                backgroundColor: "rgba(239, 68, 68, 0.1)",
                borderColor: "var(--accent-danger)",
              }}
            >
              <div style={{ padding: 32 }}>
                <p className="text-h3" style={{ color: "var(--text-primary)" }}>
                  The web app could not reach the API.
                </p>
                <p className="text-body" style={{ marginTop: 8 }}>
                  {errorMessage ?? "Start the API and refresh the page."}
                </p>
              </div>
            </div>
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
  const lastRefreshLabel = dashboard.lastRefreshAt
    ? new Date(dashboard.lastRefreshAt).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "Unavailable";

  return (
    <>
      <Container>
        <div className="flex-col gap-8" style={{ padding: "32px 0" }}>
          <div className="flex-row items-center justify-between flex-wrap gap-4">
            <div className="flex-col gap-2">
              <h1 className="text-h1">Total Net Worth</h1>
              <p className="text-sm text-secondary">As of {lastRefreshLabel}</p>
            </div>
          </div>

          <DashboardClient
            summary={dashboard.summary}
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
