"use client";

import { useEffect, useMemo, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
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

const PRIVACY_STORAGE_KEY = "finhance-hide-balances";

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

function formatSensitiveCurrency(
  value: number | null | undefined,
  currency: string,
  hidden: boolean,
): string {
  if (value == null) {
    return "Unavailable";
  }

  return hidden ? "••••" : formatCurrency(value, currency);
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
  const [hideBalances, setHideBalances] = useState(false);
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
    try {
      setHideBalances(localStorage.getItem(PRIVACY_STORAGE_KEY) === "true");
    } catch {
      setHideBalances(false);
    }
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

  function toggleCategory(category: string) {
    setOpenCategories((previous) => ({
      ...previous,
      [category]: !previous[category],
    }));
  }

  function toggleBalances() {
    setHideBalances((current) => {
      const next = !current;

      try {
        localStorage.setItem(PRIVACY_STORAGE_KEY, String(next));
      } catch {
        // Ignore storage failures and keep the in-memory setting.
      }

      return next;
    });
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

  const refreshToneClass =
    lastRefreshAt == null ? "is-warning" : refreshError ? "is-error" : "";

  return (
    <>
      <div className="dashboard-hero">
        <div className="dashboard-hero-main">
          <p className="dashboard-hero-eyebrow">Total Net Worth</p>
          <h1 className="dashboard-hero-amount">
            {formatSensitiveCurrency(
              summary.netWorth,
              baseCurrency,
              hideBalances,
            )}
          </h1>
          <div className="dashboard-hero-stats">
            <div>
              <p className="dashboard-hero-stat-label">Assets</p>
              <p className="dashboard-hero-stat-value is-positive">
                {formatSensitiveCurrency(
                  summary.assets,
                  baseCurrency,
                  hideBalances,
                )}
              </p>
            </div>
            <div>
              <p className="dashboard-hero-stat-label">Liabilities</p>
              <p className="dashboard-hero-stat-value is-negative">
                {formatSensitiveCurrency(
                  summary.liabilities,
                  baseCurrency,
                  hideBalances,
                )}
              </p>
            </div>
          </div>
        </div>

        <div className="dashboard-hero-aside">
          <div className="dashboard-hero-controls">
            <button
              type="button"
              onClick={toggleBalances}
              aria-pressed={hideBalances}
              className="btn-secondary dashboard-hero-privacy-btn"
            >
              {hideBalances ? (
                <Eye size={16} aria-hidden="true" />
              ) : (
                <EyeOff size={16} aria-hidden="true" />
              )}
              <span>{hideBalances ? "Show balances" : "Hide balances"}</span>
            </button>
            <button
              type="button"
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="btn-secondary dashboard-hero-refresh-btn"
            >
              {isRefreshing ? "Refreshing..." : "Refresh data"}
            </button>
          </div>

          <div
            className={`dashboard-refresh-card${refreshToneClass ? ` ${refreshToneClass}` : ""}`}
          >
            <p className="dashboard-hero-aside-status">{refreshStatus}</p>
            <p className="dashboard-refresh-hint">
              Quotes update only when you request a refresh.
            </p>
            {refreshNotice ? (
              <CooldownNotice
                notice={refreshNotice}
                style={{
                  fontSize: "12px",
                  color: "#f59e0b",
                  marginBottom: "0",
                }}
              />
            ) : null}
            {refreshError ? (
              <p className="dashboard-hero-aside-error">{refreshError}</p>
            ) : null}
          </div>
        </div>
      </div>

      <section className="dashboard-overview">
        <div className="glass-card dashboard-overview-card dashboard-overview-breakdown">
          <h3 className="dashboard-overview-title">Asset Allocation</h3>
          <div className="dashboard-overview-list">
            {kindTotalsArray.map(({ kind, total }) => (
              <div key={kind} className="dashboard-overview-row">
                <div className="dashboard-overview-label">
                  <div
                    className="category-dot is-large"
                    style={{ background: getKindDotColor(kind) }}
                  />
                  <span>{kind}</span>
                </div>
                <span className="dashboard-overview-value">
                  {formatSensitiveCurrency(total, baseCurrency, hideBalances)}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="glass-card dashboard-overview-card dashboard-overview-chart">
          <div className="dashboard-overview-chart-wrap">
            <AllocationChart
              size={220}
              data={kindTotalsArray.map((kindTotal) => ({
                label: kindTotal.kind,
                total: kindTotal.total,
              }))}
            />
          </div>
        </div>
      </section>

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
                        {formatSensitiveCurrency(
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
                          hideBalances,
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
                                  {asset.ticker ? (
                                    <span className="asset-row-ticker">
                                      {asset.ticker}
                                    </span>
                                  ) : null}
                                </div>
                                <div className="asset-row-meta">
                                  <p className="asset-row-meta-text">
                                    {quantityDisplay}
                                  </p>
                                  {liveUnitPrice != null ? (
                                    <span className="asset-row-live-badge">
                                      LIVE
                                    </span>
                                  ) : null}
                                  {asset.notes ? (
                                    <>
                                      <span className="asset-row-bullet">
                                        •
                                      </span>
                                      <span className="asset-row-notes">
                                        {asset.notes}
                                      </span>
                                    </>
                                  ) : null}
                                </div>
                              </div>

                              <div className="asset-row-value">
                                <p className="asset-row-value-amount">
                                  {formatSensitiveCurrency(
                                    displayValue,
                                    baseCurrency,
                                    hideBalances,
                                  )}
                                </p>
                                {referenceDiffers ? (
                                  <p className="asset-row-value-sub is-ref">
                                    Ref:{" "}
                                    {formatSensitiveCurrency(
                                      asset.referenceValue,
                                      baseCurrency,
                                      hideBalances,
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
                        {formatSensitiveCurrency(
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
                          hideBalances,
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
                                  {asset.notes ? (
                                    <>
                                      <span className="asset-row-bullet">
                                        •
                                      </span>
                                      <span className="asset-row-notes">
                                        {asset.notes}
                                      </span>
                                    </>
                                  ) : null}
                                </div>
                              </div>

                              <div className="asset-row-value">
                                <p className="asset-row-value-amount">
                                  {formatSensitiveCurrency(
                                    displayValue,
                                    baseCurrency,
                                    hideBalances,
                                  )}
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
