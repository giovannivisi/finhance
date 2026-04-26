"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { DashboardAssetResponse } from "@finhance/shared";
import CreateAssetModal from "@/components/CreateAssetModal";
import CooldownNotice from "@components/CooldownNotice";
import EditAssetModal from "@components/EditAssetModal";
import DeleteAssetButton from "@components/DeleteAssetButton";
import {
  getDashboardRefreshNotice,
  requestDashboardRefresh,
} from "@lib/dashboard-refresh";
import { formatCurrency } from "@lib/format";
import HeaderAddButton from "@components/HeaderAddButton";
import SectionHeader from "@components/SectionHeader";
import DisclosureIcon from "@components/DisclosureIcon";
import AllocationChart from "@components/AllocationChart";
import { useSingleFlightActions } from "@lib/single-flight";

function getKindDotColor(kind: string): string {
  switch (kind) {
    case "STOCK":
      return "#4f46e5";
    case "CRYPTO":
      return "#eab308";
    case "CASH":
      return "#16a34a";
    default:
      return "var(--border-glass-strong)";
  }
}

function getValuationLabel(asset: DashboardAssetResponse): string {
  switch (asset.valuationSource) {
    case "LIVE":
      return asset.isStale ? "Live quote (stale)" : "Live quote";
    case "LAST_QUOTE":
      return "Last saved quote";
    case "AVG_COST":
      return "Reference avg cost";
    case "DIRECT_BALANCE":
      return "Stored balance";
    case "UNAVAILABLE":
      return "Unavailable in dashboard currency";
    default:
      return "Stored value";
  }
}

export default function DashboardClient({
  grouped,
  kindTotalsArray,
  baseCurrency,
  lastRefreshAt,
  summary,
}: {
  grouped: Record<string, DashboardAssetResponse[]>;
  kindTotalsArray: { kind: string; total: number }[];
  baseCurrency: string;
  lastRefreshAt?: string | null;
  summary: { assets: number; liabilities: number; netWorth: number };
}) {
  const router = useRouter();
  const [editAssetId, setEditAssetId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [openCategories, setOpenCategories] = useState<Record<string, boolean>>(
    {},
  );
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [refreshNotice, setRefreshNotice] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [nowMs, setNowMs] = useState<number | null>(null);
  const autoRefreshAttemptedRef = useRef(false);
  const actions = useSingleFlightActions<"refresh">();
  const sortedCategories = useMemo(
    () => Object.keys(grouped).sort(),
    [grouped],
  );

  useEffect(() => {
    setNowMs(Date.now());
    const id = setInterval(() => setNowMs(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    setOpenCategories((previous) => {
      const next: Record<string, boolean> = {};

      for (const category of sortedCategories) {
        next[category] = previous[category] ?? true;
      }

      return next;
    });
  }, [sortedCategories]);

  useEffect(() => {
    if (autoRefreshAttemptedRef.current) {
      return;
    }

    autoRefreshAttemptedRef.current = true;

    async function runAutoRefresh() {
      const result = await requestDashboardRefresh();

      if (result.ok) {
        router.refresh();
        return;
      }

      if (getDashboardRefreshNotice(result.status, result.error)) {
        return;
      }

      setRefreshError(result.error);
    }

    void runAutoRefresh();
  }, [router]);

  function toggleCategory(category: string) {
    setOpenCategories((previous) => ({
      ...previous,
      [category]: !previous[category],
    }));
  }

  async function handleRefresh() {
    await actions.run("refresh", async () => {
      setRefreshError(null);
      setRefreshNotice(null);
      setIsRefreshing(true);

      try {
        const result = await requestDashboardRefresh();

        if (!result.ok) {
          const notice = getDashboardRefreshNotice(result.status, result.error);
          if (notice) {
            setRefreshNotice(notice);
            return;
          }
          setRefreshError(result.error);
          return;
        }

        router.refresh();
      } finally {
        setIsRefreshing(false);
      }
    });
  }

  const refreshStatus =
    lastRefreshAt == null
      ? "No quote snapshot yet"
      : nowMs == null
        ? "Quote snapshot available"
        : `Last refresh ${Math.max(
            0,
            Math.floor((nowMs - Date.parse(lastRefreshAt)) / 60_000),
          )} min ago`;

  return (
    <>
      {/* HERO SECTION */}
      <div className="dashboard-hero">
        <div>
          <p className="dashboard-hero-eyebrow">Total Net Worth</p>
          <h1 className="dashboard-hero-amount">
            {formatCurrency(summary.netWorth, baseCurrency)}
          </h1>
          <div className="dashboard-hero-stats">
            <div>
              <p className="dashboard-hero-stat-label">Assets</p>
              <p className="dashboard-hero-stat-value is-positive">
                {formatCurrency(summary.assets, baseCurrency)}
              </p>
            </div>
            <div>
              <p className="dashboard-hero-stat-label">Liabilities</p>
              <p className="dashboard-hero-stat-value is-negative">
                {formatCurrency(summary.liabilities, baseCurrency)}
              </p>
            </div>
          </div>
        </div>

        <div className="dashboard-hero-aside">
          <p className="dashboard-hero-aside-status">{refreshStatus}</p>
          {refreshNotice && (
            <CooldownNotice
              notice={refreshNotice}
              style={{
                fontSize: "12px",
                color: "#f59e0b",
                marginBottom: "4px",
              }}
            />
          )}
          {refreshError && (
            <p className="dashboard-hero-aside-error">{refreshError}</p>
          )}
          <button
            type="button"
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="btn-secondary dashboard-hero-refresh-btn"
          >
            {isRefreshing ? "Refreshing..." : "Refresh Data"}
          </button>
        </div>
      </div>

      {/* ALLOCATION OVERVIEW */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "24px",
          marginBottom: "40px",
        }}
      >
        {/* Chart Card */}
        <div
          className="glass-card"
          style={{
            padding: "32px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            minHeight: "300px",
          }}
        >
          <div style={{ width: "240px", height: "240px" }}>
            <AllocationChart
              size={240}
              data={kindTotalsArray.map((kindTotal) => ({
                label: kindTotal.kind,
                total: kindTotal.total,
              }))}
            />
          </div>
        </div>

        {/* Breakdown Card */}
        <div
          className="glass-card"
          style={{
            padding: "32px",
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
          }}
        >
          <h3
            style={{
              fontSize: "18px",
              fontWeight: 600,
              color: "var(--text-primary)",
              marginBottom: "24px",
            }}
          >
            Asset Allocation
          </h3>
          <div
            style={{ display: "flex", flexDirection: "column", gap: "16px" }}
          >
            {kindTotalsArray.map(({ kind, total }) => (
              <div
                key={kind}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <div
                  style={{ display: "flex", alignItems: "center", gap: "12px" }}
                >
                  <div
                    className="category-dot is-large"
                    style={{ background: getKindDotColor(kind) }}
                  />
                  <span
                    style={{
                      fontSize: "15px",
                      color: "var(--text-secondary)",
                      fontWeight: 500,
                    }}
                  >
                    {kind}
                  </span>
                </div>
                <span
                  style={{
                    fontSize: "16px",
                    fontWeight: 600,
                    color: "var(--text-primary)",
                  }}
                >
                  {formatCurrency(total, baseCurrency)}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <SectionHeader
        title="Assets and liabilities"
        action={<HeaderAddButton onClick={() => setCreateOpen(true)} />}
      />

      <div className="space-y-6">
        <div className="space-y-4">
          <h3 className="dashboard-section-heading">Assets</h3>
          <div className="dashboard-grid">
            {sortedCategories
              .filter((category) =>
                grouped[category].some((asset) => asset.type === "ASSET"),
              )
              .map((category) => (
                <div key={category} className="category-block">
                  <button
                    type="button"
                    onClick={() => toggleCategory(category)}
                    className="category-toggle"
                  >
                    <div className="category-toggle-label">
                      <div
                        className="category-dot"
                        style={{ background: getKindDotColor(category) }}
                      />
                      <span className="category-toggle-name">{category}</span>
                    </div>
                    <div className="category-toggle-meta">
                      <span className="category-toggle-total">
                        {formatCurrency(
                          grouped[category]
                            .filter((a) => a.type === "ASSET")
                            .reduce(
                              (sum, a) =>
                                sum +
                                (a.currentValue ??
                                  a.referenceValue ??
                                  Number(a.balance)),
                              0,
                            ),
                          baseCurrency,
                        )}
                      </span>
                      <DisclosureIcon open={openCategories[category]} />
                    </div>
                  </button>

                  {openCategories[category] ? (
                    <ul className="category-items">
                      {grouped[category]
                        .filter((asset) => asset.type === "ASSET")
                        .map((asset) => {
                          const displayValue =
                            asset.currentValue ?? asset.referenceValue;
                          const referenceDiffers =
                            asset.referenceValue != null &&
                            asset.currentValue != null &&
                            Math.abs(
                              asset.referenceValue - asset.currentValue,
                            ) > 0.005;

                          const liveUnitPrice =
                            asset.quantity && asset.currentValue
                              ? Number(asset.currentValue) /
                                Number(asset.quantity)
                              : null;

                          const quantityDisplay =
                            asset.quantity != null
                              ? `${asset.quantity} × ${formatCurrency(liveUnitPrice ?? Number(asset.unitPrice), asset.currency ?? baseCurrency)}`
                              : "Stored balance";

                          return (
                            <li key={asset.id} className="glass-card asset-row">
                              <div className="asset-row-info">
                                <div className="asset-row-headline">
                                  <p className="asset-row-name">{asset.name}</p>
                                  {asset.ticker && (
                                    <span className="asset-row-ticker">
                                      {asset.ticker}
                                    </span>
                                  )}
                                </div>
                                <div className="asset-row-meta">
                                  <p className="asset-row-meta-text">
                                    {quantityDisplay}
                                  </p>
                                  {liveUnitPrice != null && (
                                    <span className="asset-row-live-badge">
                                      LIVE
                                    </span>
                                  )}
                                  {asset.notes && (
                                    <>
                                      <span className="asset-row-bullet">
                                        •
                                      </span>
                                      <span className="asset-row-notes">
                                        {asset.notes}
                                      </span>
                                    </>
                                  )}
                                </div>
                              </div>

                              <div className="asset-row-value">
                                <p className="asset-row-value-amount">
                                  {displayValue != null
                                    ? formatCurrency(displayValue, baseCurrency)
                                    : `Unavailable`}
                                </p>
                                {referenceDiffers ? (
                                  <p className="asset-row-value-sub is-ref">
                                    Ref:{" "}
                                    {formatCurrency(
                                      asset.referenceValue!,
                                      baseCurrency,
                                    )}
                                  </p>
                                ) : (
                                  <p className="asset-row-value-sub">
                                    {getValuationLabel(asset)}
                                  </p>
                                )}
                              </div>

                              <div className="asset-row-actions">
                                <button
                                  type="button"
                                  onClick={() => setEditAssetId(asset.id)}
                                  className="asset-row-edit-btn"
                                >
                                  Edit
                                </button>
                                <DeleteAssetButton id={asset.id} />
                              </div>
                            </li>
                          );
                        })}
                    </ul>
                  ) : null}
                </div>
              ))}
          </div>
        </div>

        <div className="space-y-4">
          <h3 className="dashboard-section-heading is-secondary">
            Liabilities
          </h3>
          <div className="dashboard-grid">
            {sortedCategories
              .filter((category) =>
                grouped[category].some((asset) => asset.type === "LIABILITY"),
              )
              .map((category) => (
                <div key={category} className="category-block">
                  <button
                    type="button"
                    onClick={() => toggleCategory(category)}
                    className="category-toggle"
                  >
                    <div className="category-toggle-label">
                      <div
                        className="category-dot"
                        style={{ background: "var(--color-expense)" }}
                      />
                      <span className="category-toggle-name">{category}</span>
                    </div>
                    <div className="category-toggle-meta">
                      <span className="category-toggle-total">
                        {formatCurrency(
                          grouped[category]
                            .filter((a) => a.type === "LIABILITY")
                            .reduce(
                              (sum, a) =>
                                sum +
                                (a.currentValue ??
                                  a.referenceValue ??
                                  Number(a.balance)),
                              0,
                            ),
                          baseCurrency,
                        )}
                      </span>
                      <DisclosureIcon open={openCategories[category]} />
                    </div>
                  </button>

                  {openCategories[category] ? (
                    <ul className="category-items">
                      {grouped[category]
                        .filter((asset) => asset.type === "LIABILITY")
                        .map((asset) => {
                          const displayValue =
                            asset.currentValue ?? asset.referenceValue;

                          return (
                            <li key={asset.id} className="glass-card asset-row">
                              <div className="asset-row-info">
                                <p className="asset-row-name">{asset.name}</p>
                                <div className="asset-row-meta">
                                  <span className="asset-row-meta-text">
                                    {asset.liabilityKind ?? "Stored balance"}
                                  </span>
                                  {asset.notes && (
                                    <>
                                      <span className="asset-row-bullet">
                                        •
                                      </span>
                                      <span className="asset-row-notes">
                                        {asset.notes}
                                      </span>
                                    </>
                                  )}
                                </div>
                              </div>

                              <div className="asset-row-value">
                                <p className="asset-row-value-amount">
                                  {displayValue != null
                                    ? formatCurrency(displayValue, baseCurrency)
                                    : `Unavailable`}
                                </p>
                                <p className="asset-row-value-sub">
                                  {getValuationLabel(asset)}
                                </p>
                              </div>

                              <div className="asset-row-actions">
                                <button
                                  type="button"
                                  onClick={() => setEditAssetId(asset.id)}
                                  className="asset-row-edit-btn"
                                >
                                  Edit
                                </button>
                                <DeleteAssetButton id={asset.id} />
                              </div>
                            </li>
                          );
                        })}
                    </ul>
                  ) : null}
                </div>
              ))}
          </div>
        </div>
      </div>

      <EditAssetModal
        assetId={editAssetId}
        open={Boolean(editAssetId)}
        onClose={() => setEditAssetId(null)}
      />

      <CreateAssetModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
      />
    </>
  );
}
