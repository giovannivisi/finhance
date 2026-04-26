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

      <div className="space-y-6">
        <div className="space-y-4">
          <h3
            style={{
              fontSize: "20px",
              fontWeight: 600,
              color: "var(--text-primary)",
              paddingLeft: "8px",
              marginBottom: "8px",
            }}
          >
            Assets
          </h3>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(450px, 1fr))",
              gap: "24px",
              alignItems: "start",
            }}
          >
            {sortedCategories
              .filter((category) =>
                grouped[category].some((asset) => asset.type === "ASSET"),
              )
              .map((category) => (
                <div
                  key={category}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "12px",
                  }}
                >
                  <button
                    type="button"
                    onClick={() => toggleCategory(category)}
                    className="flex items-center justify-between w-full text-left group"
                    style={{
                      padding: "12px 16px",
                      borderRadius: "var(--radius-md)",
                      background: "transparent",
                      transition: "background 0.2s",
                    }}
                    onMouseOver={(e) =>
                      (e.currentTarget.style.background =
                        "var(--bg-card-hover)")
                    }
                    onMouseOut={(e) =>
                      (e.currentTarget.style.background = "transparent")
                    }
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "12px",
                      }}
                    >
                      <div
                        style={{
                          width: "10px",
                          height: "10px",
                          borderRadius: "50%",
                          background:
                            category === "STOCK"
                              ? "#4f46e5"
                              : category === "CRYPTO"
                                ? "#eab308"
                                : category === "CASH"
                                  ? "#16a34a"
                                  : "var(--border-glass-strong)",
                        }}
                      />
                      <span
                        style={{
                          fontSize: "16px",
                          fontWeight: 600,
                          color: "var(--text-primary)",
                          letterSpacing: "0.02em",
                        }}
                      >
                        {category}
                      </span>
                    </div>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "16px",
                      }}
                    >
                      <span
                        style={{
                          fontSize: "15px",
                          fontWeight: 600,
                          color: "var(--text-primary)",
                        }}
                      >
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
                    <ul
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: "12px",
                      }}
                    >
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
                            <li
                              key={asset.id}
                              className="glass-card group"
                              style={{
                                padding: "16px 24px",
                                display: "flex",
                                alignItems: "center",
                                gap: "24px",
                              }}
                            >
                              <div
                                style={{
                                  flex: 1,
                                  display: "flex",
                                  flexDirection: "column",
                                  gap: "2px",
                                }}
                              >
                                <div
                                  style={{
                                    display: "flex",
                                    alignItems: "baseline",
                                    gap: "8px",
                                  }}
                                >
                                  <p
                                    style={{
                                      fontWeight: 600,
                                      color: "var(--text-primary)",
                                      fontSize: "17px",
                                    }}
                                  >
                                    {asset.name}
                                  </p>
                                  {asset.ticker && (
                                    <span
                                      style={{
                                        fontSize: "12px",
                                        color: "var(--text-tertiary)",
                                        letterSpacing: "0.05em",
                                      }}
                                    >
                                      {asset.ticker}
                                    </span>
                                  )}
                                </div>
                                <div
                                  style={{
                                    display: "flex",
                                    alignItems: "baseline",
                                    gap: "8px",
                                  }}
                                >
                                  <p
                                    style={{
                                      fontSize: "13px",
                                      color: "var(--text-secondary)",
                                      fontWeight: 500,
                                    }}
                                  >
                                    {quantityDisplay}
                                  </p>
                                  {liveUnitPrice != null && (
                                    <span
                                      style={{
                                        fontSize: "10px",
                                        color: "var(--color-income)",
                                        fontWeight: 700,
                                        letterSpacing: "0.05em",
                                        opacity: 0.9,
                                        lineHeight: 1,
                                      }}
                                    >
                                      LIVE
                                    </span>
                                  )}
                                  {asset.notes && (
                                    <>
                                      <span
                                        style={{
                                          color: "var(--border-glass-strong)",
                                          fontSize: "13px",
                                        }}
                                      >
                                        •
                                      </span>
                                      <span
                                        style={{
                                          fontSize: "13px",
                                          color: "var(--text-tertiary)",
                                          fontStyle: "italic",
                                          maxWidth: "200px",
                                          whiteSpace: "nowrap",
                                          overflow: "hidden",
                                          textOverflow: "ellipsis",
                                        }}
                                      >
                                        {asset.notes}
                                      </span>
                                    </>
                                  )}
                                </div>
                              </div>

                              <div
                                style={{
                                  display: "flex",
                                  flexDirection: "column",
                                  alignItems: "flex-end",
                                  gap: "2px",
                                  minWidth: "120px",
                                }}
                              >
                                <p
                                  style={{
                                    fontSize: "17px",
                                    fontWeight: 600,
                                    color: "var(--text-primary)",
                                  }}
                                >
                                  {displayValue != null
                                    ? formatCurrency(displayValue, baseCurrency)
                                    : `Unavailable`}
                                </p>
                                {referenceDiffers ? (
                                  <p
                                    style={{
                                      fontSize: "13px",
                                      color: "var(--text-secondary)",
                                    }}
                                  >
                                    Ref:{" "}
                                    {formatCurrency(
                                      asset.referenceValue!,
                                      baseCurrency,
                                    )}
                                  </p>
                                ) : (
                                  <p
                                    style={{
                                      fontSize: "13px",
                                      color: "var(--text-tertiary)",
                                    }}
                                  >
                                    {getValuationLabel(asset)}
                                  </p>
                                )}
                              </div>

                              <div
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: "16px",
                                  opacity: 0.4,
                                  transition: "opacity 0.2s",
                                }}
                                onMouseOver={(e) =>
                                  (e.currentTarget.style.opacity = "1")
                                }
                                onMouseOut={(e) =>
                                  (e.currentTarget.style.opacity = "0.4")
                                }
                              >
                                <button
                                  type="button"
                                  onClick={() => setEditAssetId(asset.id)}
                                  style={{
                                    color: "var(--text-secondary)",
                                    fontSize: "13px",
                                    fontWeight: 500,
                                    cursor: "pointer",
                                    transition: "color 0.2s",
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

        <div className="space-y-4">
          <h3
            style={{
              fontSize: "20px",
              fontWeight: 600,
              color: "var(--text-primary)",
              paddingLeft: "8px",
              marginBottom: "8px",
              marginTop: "32px",
            }}
          >
            Liabilities
          </h3>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(450px, 1fr))",
              gap: "24px",
              alignItems: "start",
            }}
          >
            {sortedCategories
              .filter((category) =>
                grouped[category].some((asset) => asset.type === "LIABILITY"),
              )
              .map((category) => (
                <div
                  key={category}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "12px",
                  }}
                >
                  <button
                    type="button"
                    onClick={() => toggleCategory(category)}
                    className="flex items-center justify-between w-full text-left group"
                    style={{
                      padding: "12px 16px",
                      borderRadius: "var(--radius-md)",
                      background: "transparent",
                      transition: "background 0.2s",
                    }}
                    onMouseOver={(e) =>
                      (e.currentTarget.style.background =
                        "var(--bg-card-hover)")
                    }
                    onMouseOut={(e) =>
                      (e.currentTarget.style.background = "transparent")
                    }
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "12px",
                      }}
                    >
                      <div
                        style={{
                          width: "10px",
                          height: "10px",
                          borderRadius: "50%",
                          background: "var(--color-expense)",
                        }}
                      />
                      <span
                        style={{
                          fontSize: "16px",
                          fontWeight: 600,
                          color: "var(--text-primary)",
                          letterSpacing: "0.02em",
                        }}
                      >
                        {category}
                      </span>
                    </div>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "16px",
                      }}
                    >
                      <span
                        style={{
                          fontSize: "15px",
                          fontWeight: 600,
                          color: "var(--text-primary)",
                        }}
                      >
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
                    <ul
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: "12px",
                      }}
                    >
                      {grouped[category]
                        .filter((asset) => asset.type === "LIABILITY")
                        .map((asset) => {
                          const displayValue =
                            asset.currentValue ?? asset.referenceValue;

                          return (
                            <li
                              key={asset.id}
                              className="glass-card group"
                              style={{
                                padding: "16px 24px",
                                display: "flex",
                                alignItems: "center",
                                gap: "24px",
                              }}
                            >
                              <div
                                style={{
                                  flex: 1,
                                  display: "flex",
                                  flexDirection: "column",
                                  gap: "2px",
                                }}
                              >
                                <p
                                  style={{
                                    fontWeight: 600,
                                    color: "var(--text-primary)",
                                    fontSize: "17px",
                                  }}
                                >
                                  {asset.name}
                                </p>
                                <div
                                  style={{
                                    display: "flex",
                                    alignItems: "baseline",
                                    gap: "8px",
                                  }}
                                >
                                  {asset.liabilityKind ? (
                                    <span
                                      style={{
                                        fontSize: "13px",
                                        color: "var(--text-secondary)",
                                        fontWeight: 500,
                                      }}
                                    >
                                      {asset.liabilityKind}
                                    </span>
                                  ) : (
                                    <span
                                      style={{
                                        fontSize: "13px",
                                        color: "var(--text-secondary)",
                                      }}
                                    >
                                      Stored balance
                                    </span>
                                  )}
                                  {asset.notes && (
                                    <>
                                      <span
                                        style={{
                                          color: "var(--border-glass-strong)",
                                          fontSize: "13px",
                                        }}
                                      >
                                        •
                                      </span>
                                      <span
                                        style={{
                                          fontSize: "13px",
                                          color: "var(--text-tertiary)",
                                          fontStyle: "italic",
                                          maxWidth: "200px",
                                          whiteSpace: "nowrap",
                                          overflow: "hidden",
                                          textOverflow: "ellipsis",
                                        }}
                                      >
                                        {asset.notes}
                                      </span>
                                    </>
                                  )}
                                </div>
                              </div>

                              <div
                                style={{
                                  display: "flex",
                                  flexDirection: "column",
                                  alignItems: "flex-end",
                                  gap: "2px",
                                  minWidth: "120px",
                                }}
                              >
                                <p
                                  style={{
                                    fontSize: "17px",
                                    fontWeight: 600,
                                    color: "var(--text-primary)",
                                  }}
                                >
                                  {displayValue != null
                                    ? formatCurrency(displayValue, baseCurrency)
                                    : `Unavailable`}
                                </p>
                                <p
                                  style={{
                                    fontSize: "13px",
                                    color: "var(--text-tertiary)",
                                  }}
                                >
                                  {getValuationLabel(asset)}
                                </p>
                              </div>

                              <div
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: "16px",
                                  opacity: 0.4,
                                  transition: "opacity 0.2s",
                                }}
                                onMouseOver={(e) =>
                                  (e.currentTarget.style.opacity = "1")
                                }
                                onMouseOut={(e) =>
                                  (e.currentTarget.style.opacity = "0.4")
                                }
                              >
                                <button
                                  type="button"
                                  onClick={() => setEditAssetId(asset.id)}
                                  style={{
                                    color: "var(--text-secondary)",
                                    fontSize: "13px",
                                    fontWeight: 500,
                                    cursor: "pointer",
                                    transition: "color 0.2s",
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
