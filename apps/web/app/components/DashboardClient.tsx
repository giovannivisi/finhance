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
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-end",
          marginBottom: "32px",
        }}
      >
        <div>
          <p
            style={{
              fontSize: "14px",
              color: "var(--text-secondary)",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              fontWeight: 600,
            }}
          >
            Total Net Worth
          </p>
          <h1
            style={{
              fontSize: "48px",
              fontWeight: 800,
              color: "var(--text-primary)",
              letterSpacing: "-0.04em",
              margin: "8px 0 0 0",
              lineHeight: 1,
            }}
          >
            {formatCurrency(summary.netWorth, baseCurrency)}
          </h1>
          <div style={{ display: "flex", gap: "24px", marginTop: "16px" }}>
            <div>
              <p style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
                Assets
              </p>
              <p
                style={{
                  fontSize: "18px",
                  fontWeight: 600,
                  color: "var(--color-income)",
                }}
              >
                {formatCurrency(summary.assets, baseCurrency)}
              </p>
            </div>
            <div>
              <p style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
                Liabilities
              </p>
              <p
                style={{
                  fontSize: "18px",
                  fontWeight: 600,
                  color: "var(--color-expense)",
                }}
              >
                {formatCurrency(summary.liabilities, baseCurrency)}
              </p>
            </div>
          </div>
        </div>

        <div style={{ textAlign: "right" }}>
          <p
            style={{
              fontSize: "12px",
              color: "var(--text-secondary)",
              marginBottom: "8px",
            }}
          >
            {refreshStatus}
          </p>
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
            <p
              style={{
                fontSize: "12px",
                color: "var(--color-expense)",
                marginBottom: "4px",
              }}
            >
              {refreshError}
            </p>
          )}
          <button
            type="button"
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="btn-secondary"
            style={{
              padding: "8px 16px",
              borderRadius: "100px",
              fontSize: "13px",
            }}
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
                    style={{
                      width: "12px",
                      height: "12px",
                      borderRadius: "50%",
                      background:
                        kind === "STOCK"
                          ? "#4f46e5"
                          : kind === "CRYPTO"
                            ? "#eab308"
                            : kind === "CASH"
                              ? "#16a34a"
                              : "var(--border-glass-strong)",
                    }}
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

      <div className="space-y-6 mt-6">
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "16px",
            marginTop: "40px",
            marginBottom: "16px",
          }}
        >
          <div
            style={{
              flex: 1,
              height: "1px",
              background: "var(--border-glass-strong)",
            }}
          ></div>
          <span
            style={{
              fontSize: "14px",
              fontWeight: 600,
              color: "var(--text-tertiary)",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
            }}
          >
            Assets
          </span>
          <div
            style={{
              flex: 1,
              height: "1px",
              background: "var(--border-glass-strong)",
            }}
          ></div>
        </div>

        <div className="space-y-6">
          {sortedCategories
            .filter((category) =>
              grouped[category].some((asset) => asset.type === "ASSET"),
            )
            .map((category) => (
              <div key={category}>
                <button
                  type="button"
                  onClick={() => toggleCategory(category)}
                  className="flex items-center justify-between w-full text-left"
                >
                  <span
                    style={{
                      fontSize: "18px",
                      fontWeight: 600,
                      color: "var(--text-primary)",
                    }}
                  >
                    {category}
                  </span>
                  <DisclosureIcon open={openCategories[category]} />
                </button>

                {openCategories[category] ? (
                  <ul className="space-y-2 mt-2 transition-all duration-200 ease-in-out">
                    {grouped[category]
                      .filter((asset) => asset.type === "ASSET")
                      .map((asset) => {
                        const displayValue =
                          asset.currentValue ?? asset.referenceValue;
                        const referenceDiffers =
                          asset.referenceValue != null &&
                          asset.currentValue != null &&
                          Math.abs(asset.referenceValue - asset.currentValue) >
                            0.005;

                        return (
                          <li
                            key={asset.id}
                            className="glass-card"
                            style={{
                              padding: "16px",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "space-between",
                            }}
                          >
                            <div
                              style={{
                                display: "flex",
                                flexDirection: "column",
                              }}
                            >
                              <div
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: "8px",
                                }}
                              >
                                <p
                                  style={{
                                    fontWeight: 600,
                                    color: "var(--text-primary)",
                                    fontSize: "16px",
                                  }}
                                >
                                  {asset.name}
                                </p>
                                {asset.ticker ? (
                                  <span
                                    style={{
                                      fontSize: "12px",
                                      color: "var(--text-secondary)",
                                    }}
                                  >
                                    ({asset.ticker})
                                  </span>
                                ) : null}
                              </div>

                              <div className="flex flex-wrap items-center gap-2 mt-1">
                                <span
                                  className={
                                    "px-2 py-0.5 rounded-full text-xs font-medium text-white " +
                                    (asset.kind === "STOCK"
                                      ? "bg-indigo-600"
                                      : asset.kind === "CRYPTO"
                                        ? "bg-yellow-500"
                                        : asset.kind === "CASH"
                                          ? "bg-green-600"
                                          : "bg-gray-500")
                                  }
                                >
                                  {asset.kind}
                                </span>

                                {asset.quantity != null &&
                                asset.unitPrice != null ? (
                                  <span
                                    style={{
                                      fontSize: "12px",
                                      color: "var(--text-secondary)",
                                    }}
                                  >
                                    {asset.quantity} ×{" "}
                                    {formatCurrency(
                                      Number(asset.unitPrice),
                                      asset.currency ?? baseCurrency,
                                    )}
                                  </span>
                                ) : null}

                                {asset.notes ? (
                                  <span className="text-xs text-gray-400 italic truncate max-w-[150px]">
                                    {asset.notes}
                                  </span>
                                ) : null}
                              </div>
                            </div>

                            <div className="flex items-center gap-4">
                              <div className="flex flex-col items-end">
                                <p
                                  style={{
                                    fontSize: "18px",
                                    fontWeight: 600,
                                    color: "var(--text-primary)",
                                  }}
                                >
                                  {displayValue != null
                                    ? formatCurrency(displayValue, baseCurrency)
                                    : `Unavailable in ${baseCurrency}`}
                                </p>
                                <p
                                  style={{
                                    fontSize: "12px",
                                    color: "var(--text-secondary)",
                                  }}
                                >
                                  {getValuationLabel(asset)}
                                </p>
                                {referenceDiffers ? (
                                  <p
                                    style={{
                                      fontSize: "12px",
                                      color: "var(--text-secondary)",
                                    }}
                                  >
                                    Ref:{" "}
                                    {formatCurrency(
                                      asset.referenceValue!,
                                      baseCurrency,
                                    )}
                                  </p>
                                ) : null}
                                {displayValue == null ? (
                                  <p
                                    style={{
                                      fontSize: "12px",
                                      color: "var(--text-secondary)",
                                    }}
                                  >
                                    Stored amount:{" "}
                                    {formatCurrency(
                                      Number(asset.balance),
                                      asset.currency ?? baseCurrency,
                                    )}
                                  </p>
                                ) : null}
                              </div>

                              <button
                                type="button"
                                onClick={() => setEditAssetId(asset.id)}
                                style={{
                                  color: "var(--text-secondary)",
                                  fontSize: "13px",
                                  padding: "8px 12px",
                                  background: "var(--bg-card-hover)",
                                  borderRadius: "8px",
                                  border:
                                    "1px solid var(--border-glass-strong)",
                                  cursor: "pointer",
                                  transition: "all 0.2s",
                                }}
                                onMouseOver={(e) =>
                                  (e.currentTarget.style.color =
                                    "var(--text-primary)")
                                }
                                onMouseOut={(e) =>
                                  (e.currentTarget.style.color =
                                    "var(--text-secondary)")
                                }
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

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "16px",
            marginTop: "40px",
            marginBottom: "16px",
          }}
        >
          <div
            style={{
              flex: 1,
              height: "1px",
              background: "var(--border-glass-strong)",
            }}
          ></div>
          <span
            style={{
              fontSize: "14px",
              fontWeight: 600,
              color: "var(--text-tertiary)",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
            }}
          >
            Liabilities
          </span>
          <div
            style={{
              flex: 1,
              height: "1px",
              background: "var(--border-glass-strong)",
            }}
          ></div>
        </div>

        <div className="space-y-6">
          {sortedCategories
            .filter((category) =>
              grouped[category].some((asset) => asset.type === "LIABILITY"),
            )
            .map((category) => (
              <div key={category}>
                <button
                  type="button"
                  onClick={() => toggleCategory(category)}
                  className="flex items-center justify-between w-full text-left"
                >
                  <span
                    style={{
                      fontSize: "18px",
                      fontWeight: 600,
                      color: "var(--color-expense)",
                    }}
                  >
                    {category}
                  </span>
                  <DisclosureIcon open={openCategories[category]} />
                </button>

                {openCategories[category] ? (
                  <ul className="space-y-2 mt-2 transition-all duration-200 ease-in-out">
                    {grouped[category]
                      .filter((asset) => asset.type === "LIABILITY")
                      .map((asset) => {
                        const displayValue =
                          asset.currentValue ?? asset.referenceValue;

                        return (
                          <li
                            key={asset.id}
                            className="glass-card"
                            style={{
                              padding: "16px",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "space-between",
                            }}
                          >
                            <div className="flex flex-col">
                              <div className="flex items-center gap-2">
                                <p
                                  style={{
                                    fontWeight: 600,
                                    color: "var(--text-primary)",
                                    fontSize: "16px",
                                  }}
                                >
                                  {asset.name}
                                </p>
                              </div>

                              <div className="flex flex-wrap items-center gap-2 mt-1">
                                <span className="px-2 py-0.5 rounded-full text-xs font-medium text-white bg-red-600">
                                  {asset.liabilityKind}
                                </span>

                                {asset.notes ? (
                                  <span className="text-xs text-gray-400 italic truncate max-w-[150px]">
                                    {asset.notes}
                                  </span>
                                ) : null}
                              </div>
                            </div>

                            <div className="flex items-center gap-4">
                              <div className="flex flex-col items-end">
                                <p
                                  style={{
                                    fontSize: "18px",
                                    fontWeight: 600,
                                    color: "var(--text-primary)",
                                  }}
                                >
                                  {displayValue != null
                                    ? formatCurrency(displayValue, baseCurrency)
                                    : `Unavailable in ${baseCurrency}`}
                                </p>
                                <p
                                  style={{
                                    fontSize: "12px",
                                    color: "var(--text-secondary)",
                                  }}
                                >
                                  {getValuationLabel(asset)}
                                </p>
                              </div>

                              <button
                                type="button"
                                onClick={() => setEditAssetId(asset.id)}
                                style={{
                                  color: "var(--text-secondary)",
                                  fontSize: "13px",
                                  padding: "8px 12px",
                                  background: "var(--bg-card-hover)",
                                  borderRadius: "8px",
                                  border:
                                    "1px solid var(--border-glass-strong)",
                                  cursor: "pointer",
                                  transition: "all 0.2s",
                                }}
                                onMouseOver={(e) =>
                                  (e.currentTarget.style.color =
                                    "var(--text-primary)")
                                }
                                onMouseOut={(e) =>
                                  (e.currentTarget.style.color =
                                    "var(--text-secondary)")
                                }
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
