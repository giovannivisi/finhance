"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import type { DashboardAssetResponse } from "@finhance/shared";
import CreateAssetModal from "@/components/CreateAssetModal";
import EditAssetModal from "@components/EditAssetModal";
import DeleteAssetButton from "@components/DeleteAssetButton";
import { getApiUrl, readApiError } from "@lib/api";
import { formatCurrency } from "@lib/format";
import HeaderAddButton from "@components/HeaderAddButton";
import SectionHeader from "@components/SectionHeader";
import DisclosureIcon from "@components/DisclosureIcon";
import AllocationChart from "@components/AllocationChart";

type AccentTextStyle = CSSProperties & {
  "--accent-primary": string;
  "--accent-secondary": string;
};

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

import { PortfolioChart } from "./PortfolioChart";
import { Building2, CreditCard } from "lucide-react";

const DANGER_ACCENT_TEXT_STYLE: AccentTextStyle = {
  "--accent-primary": "var(--accent-danger)",
  "--accent-secondary": "var(--accent-warning)",
};

export default function DashboardClient({
  summary,
  grouped,
  kindTotalsArray,
  baseCurrency,
  lastRefreshAt,
}: {
  summary: { netWorth: number; assets: number; liabilities: number };
  grouped: Record<string, DashboardAssetResponse[]>;
  kindTotalsArray: { kind: string; total: number }[];
  baseCurrency: string;
  lastRefreshAt?: string | null;
}) {
  const router = useRouter();
  const [editAssetId, setEditAssetId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [openCategories, setOpenCategories] = useState<Record<string, boolean>>(
    {},
  );
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [nowMs, setNowMs] = useState<number | null>(null);
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

  function toggleCategory(category: string) {
    setOpenCategories((previous) => ({
      ...previous,
      [category]: !previous[category],
    }));
  }

  async function handleRefresh() {
    setRefreshError(null);
    setIsRefreshing(true);

    try {
      const response = await fetch(getApiUrl("/assets/refresh"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      if (!response.ok) {
        setRefreshError(await readApiError(response));
        return;
      }

      router.refresh();
    } catch (error) {
      setRefreshError(
        error instanceof Error
          ? error.message
          : "Unable to refresh asset quotes.",
      );
    } finally {
      setIsRefreshing(false);
    }
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
      <div className="flex-row items-center justify-between gap-4 mb-4">
        <div className="flex-col">
          <p className="text-sm">{refreshStatus}</p>
          {refreshError ? (
            <p
              className="text-xs text-gradient mt-2"
              style={DANGER_ACCENT_TEXT_STYLE}
            >
              {refreshError}
            </p>
          ) : null}
        </div>

        <button
          type="button"
          onClick={handleRefresh}
          disabled={isRefreshing}
          className="btn btn-secondary"
          style={{
            opacity: isRefreshing ? 0.6 : 1,
            cursor: isRefreshing ? "not-allowed" : "pointer",
          }}
        >
          {isRefreshing ? "Refreshing..." : "Refresh"}
        </button>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
          gap: "24px",
        }}
      >
        <div className="flex-col gap-6" style={{ gridColumn: "1 / -1" }}>
          <div
            className="glass-card flex-col"
            style={{ padding: "32px", width: "100%" }}
          >
            <p className="text-xs font-bold text-secondary tracking-widest uppercase">
              Total Portfolio Value
            </p>
            <h2
              className="text-display-md font-bold mt-2"
              style={{ letterSpacing: "-0.04em" }}
            >
              {formatCurrency(summary.netWorth, baseCurrency)}
            </h2>
            <PortfolioChart currentValue={summary.netWorth} />
          </div>
        </div>

        <div
          className="glass-card flex-col items-center justify-center"
          style={{ padding: "32px" }}
        >
          <p className="text-xs font-bold text-secondary tracking-widest uppercase w-full text-left">
            Asset Allocation
          </p>
          <div style={{ width: 240, height: 240, marginTop: 32 }}>
            <AllocationChart
              size={240}
              data={kindTotalsArray.map((kindTotal) => ({
                label: kindTotal.kind,
                total: kindTotal.total,
              }))}
            />
          </div>
        </div>

        <div className="flex-col gap-6">
          <div
            className="glass-card flex-col"
            style={{ padding: "24px", height: "100%" }}
          >
            <div
              className="avatar"
              style={{
                backgroundColor: "var(--surface-container)",
                width: 40,
                height: 40,
                marginBottom: 16,
              }}
            >
              <Building2 size={20} color="var(--text-primary)" />
            </div>
            <p className="text-h4 font-bold">Total Assets</p>
            <p className="text-secondary mt-1">
              {formatCurrency(summary.assets, baseCurrency)}
            </p>
          </div>
        </div>

        <div className="flex-col gap-6">
          <div
            className="glass-card flex-col"
            style={{ padding: "24px", height: "100%" }}
          >
            <div
              className="avatar"
              style={{
                backgroundColor: "var(--surface-container)",
                width: 40,
                height: 40,
                marginBottom: 16,
              }}
            >
              <CreditCard size={20} color="var(--text-primary)" />
            </div>
            <p className="text-h4 font-bold">Total Liabilities</p>
            <p className="text-secondary mt-1">
              {formatCurrency(summary.liabilities, baseCurrency)}
            </p>
          </div>
        </div>
      </div>

      <div className="mt-12">
        <SectionHeader
          title="Assets and liabilities"
          action={<HeaderAddButton onClick={() => setCreateOpen(true)} />}
        />
      </div>

      <div className="flex-col gap-6 mt-6">
        <div className="flex-row items-center gap-4">
          <div
            style={{
              flex: 1,
              height: 1,
              backgroundColor: "var(--border-color)",
            }}
          ></div>
          <span className="text-h3">Assets</span>
          <div
            style={{
              flex: 1,
              height: 1,
              backgroundColor: "var(--border-color)",
            }}
          ></div>
        </div>

        <div className="flex-col gap-4">
          {sortedCategories
            .filter((category) =>
              grouped[category].some((asset) => asset.type === "ASSET"),
            )
            .map((category) => (
              <div key={category} className="flex-col gap-2">
                <button
                  type="button"
                  onClick={() => toggleCategory(category)}
                  className="flex-row items-center justify-between w-full"
                  style={{ textAlign: "left", padding: "8px 0" }}
                >
                  <span className="text-body font-bold text-gradient">
                    {category}
                  </span>
                  <DisclosureIcon open={openCategories[category]} />
                </button>

                {openCategories[category] ? (
                  <ul className="flex-col" style={{ gap: 12 }}>
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

                        const badgeClass =
                          asset.kind === "STOCK"
                            ? "badge-purple"
                            : asset.kind === "CRYPTO"
                              ? "badge-yellow"
                              : asset.kind === "CASH"
                                ? "badge-green"
                                : "badge-blue";

                        return (
                          <li
                            key={asset.id}
                            className="glass-card flex-row justify-between items-center animate-slide-up"
                            style={{ padding: 20 }}
                          >
                            <div className="flex-col gap-2">
                              <div className="flex-row items-center gap-2">
                                <p className="text-body font-bold">
                                  {asset.name}
                                </p>
                                {asset.ticker ? (
                                  <span className="text-xs text-secondary">
                                    ({asset.ticker})
                                  </span>
                                ) : null}
                              </div>

                              <div className="flex-row items-center flex-wrap gap-2">
                                <span className={`badge ${badgeClass}`}>
                                  {asset.kind}
                                </span>

                                {asset.quantity != null &&
                                asset.unitPrice != null ? (
                                  <span className="text-xs">
                                    {asset.quantity} ×{" "}
                                    {formatCurrency(
                                      Number(asset.unitPrice),
                                      asset.currency ?? baseCurrency,
                                    )}
                                  </span>
                                ) : null}

                                {asset.notes ? (
                                  <span
                                    className="text-xs text-tertiary"
                                    style={{
                                      fontStyle: "italic",
                                      whiteSpace: "nowrap",
                                      overflow: "hidden",
                                      textOverflow: "ellipsis",
                                      maxWidth: 150,
                                    }}
                                  >
                                    {asset.notes}
                                  </span>
                                ) : null}
                              </div>
                            </div>

                            <div className="flex-row items-center gap-4">
                              <div
                                className="flex-col"
                                style={{ alignItems: "flex-end" }}
                              >
                                <p className="text-body font-bold">
                                  {displayValue != null
                                    ? formatCurrency(displayValue, baseCurrency)
                                    : `Unavailable in ${baseCurrency}`}
                                </p>
                                <p className="text-xs">
                                  {getValuationLabel(asset)}
                                </p>
                                {referenceDiffers ? (
                                  <p className="text-xs text-secondary">
                                    Ref:{" "}
                                    {formatCurrency(
                                      asset.referenceValue!,
                                      baseCurrency,
                                    )}
                                  </p>
                                ) : null}
                                {displayValue == null ? (
                                  <p className="text-xs text-secondary">
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
                                className="text-sm font-medium"
                                style={{ color: "var(--accent-primary)" }}
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

        <div className="flex-row items-center gap-4 mt-6">
          <div
            style={{
              flex: 1,
              height: 1,
              backgroundColor: "var(--border-color)",
            }}
          ></div>
          <span className="text-h3">Liabilities</span>
          <div
            style={{
              flex: 1,
              height: 1,
              backgroundColor: "var(--border-color)",
            }}
          ></div>
        </div>

        <div className="flex-col gap-4">
          {sortedCategories
            .filter((category) =>
              grouped[category].some((asset) => asset.type === "LIABILITY"),
            )
            .map((category) => (
              <div key={category} className="flex-col gap-2">
                <button
                  type="button"
                  onClick={() => toggleCategory(category)}
                  className="flex-row items-center justify-between w-full"
                  style={{ textAlign: "left", padding: "8px 0" }}
                >
                  <span
                    className="text-body font-bold text-gradient"
                    style={DANGER_ACCENT_TEXT_STYLE}
                  >
                    {category}
                  </span>
                  <DisclosureIcon open={openCategories[category]} />
                </button>

                {openCategories[category] ? (
                  <ul className="flex-col" style={{ gap: 12 }}>
                    {grouped[category]
                      .filter((asset) => asset.type === "LIABILITY")
                      .map((asset) => {
                        const displayValue =
                          asset.currentValue ?? asset.referenceValue;

                        return (
                          <li
                            key={asset.id}
                            className="glass-card flex-row justify-between items-center animate-slide-up"
                            style={{ padding: 20 }}
                          >
                            <div className="flex-col gap-2">
                              <div className="flex-row items-center gap-2">
                                <p className="text-body font-bold">
                                  {asset.name}
                                </p>
                              </div>

                              <div className="flex-row items-center flex-wrap gap-2">
                                <span className="badge badge-red">
                                  {asset.liabilityKind}
                                </span>

                                {asset.notes ? (
                                  <span
                                    className="text-xs text-tertiary"
                                    style={{
                                      fontStyle: "italic",
                                      whiteSpace: "nowrap",
                                      overflow: "hidden",
                                      textOverflow: "ellipsis",
                                      maxWidth: 150,
                                    }}
                                  >
                                    {asset.notes}
                                  </span>
                                ) : null}
                              </div>
                            </div>

                            <div className="flex-row items-center gap-4">
                              <div
                                className="flex-col"
                                style={{ alignItems: "flex-end" }}
                              >
                                <p className="text-body font-bold">
                                  {displayValue != null
                                    ? formatCurrency(displayValue, baseCurrency)
                                    : `Unavailable in ${baseCurrency}`}
                                </p>
                                <p className="text-xs">
                                  {getValuationLabel(asset)}
                                </p>
                              </div>

                              <button
                                type="button"
                                onClick={() => setEditAssetId(asset.id)}
                                className="text-sm font-medium"
                                style={{ color: "var(--accent-primary)" }}
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
