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
}: {
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
      <SectionHeader title="Asset Allocation" />

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm text-gray-500">{refreshStatus}</p>
          {refreshNotice ? (
            <CooldownNotice
              key={refreshNotice}
              notice={refreshNotice}
              className="mt-1 text-sm text-amber-700"
            />
          ) : null}
          {refreshError ? (
            <p className="mt-1 text-sm text-red-600">{refreshError}</p>
          ) : null}
        </div>

        <button
          type="button"
          onClick={handleRefresh}
          disabled={isRefreshing}
          style={{
            fontSize: "14px",
            padding: "8px 16px",
            borderRadius: "8px",
            background: "var(--color-primary)",
            color: "white",
            opacity: isRefreshing ? 0.6 : 1,
            cursor: isRefreshing ? "not-allowed" : "pointer",
          }}
        >
          {isRefreshing ? "Refreshing..." : "Refresh"}
        </button>
      </div>

      <div
        className="glass-card"
        style={{
          padding: "40px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          margin: "24px auto",
        }}
      >
        <div style={{ width: "520px", height: "520px" }}>
          <AllocationChart
            size={520}
            data={kindTotalsArray.map((kindTotal) => ({
              label: kindTotal.kind,
              total: kindTotal.total,
            }))}
          />
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
          gap: "24px",
          marginTop: "24px",
        }}
      >
        {kindTotalsArray.map(({ kind, total }) => (
          <div
            key={kind}
            className="glass-card"
            style={{ padding: "24px", textAlign: "center" }}
          >
            <p style={{ fontSize: "14px", color: "var(--text-secondary)" }}>
              {kind}
            </p>
            <p style={{ fontSize: "24px", fontWeight: 700, marginTop: "8px" }}>
              {formatCurrency(total, baseCurrency)}
            </p>
          </div>
        ))}
      </div>

      <SectionHeader
        title="Assets and liabilities"
        action={<HeaderAddButton onClick={() => setCreateOpen(true)} />}
      />

      <div className="space-y-10 mt-6">
        <div className="flex items-center gap-4">
          <div className="flex-1 h-px bg-gray-300"></div>
          <span className="text-lg font-semibold text-gray-700">Assets</span>
          <div className="flex-1 h-px bg-gray-300"></div>
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
                  <span className="text-lg font-medium text-gray-900">
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
                                <p style={{ fontWeight: 600 }}>{asset.name}</p>
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
                                  <span className="text-xs text-gray-600">
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
                                <p className="text-lg font-semibold text-gray-900">
                                  {displayValue != null
                                    ? formatCurrency(displayValue, baseCurrency)
                                    : `Unavailable in ${baseCurrency}`}
                                </p>
                                <p className="text-xs text-gray-500">
                                  {getValuationLabel(asset)}
                                </p>
                                {referenceDiffers ? (
                                  <p className="text-xs text-gray-500">
                                    Ref:{" "}
                                    {formatCurrency(
                                      asset.referenceValue!,
                                      baseCurrency,
                                    )}
                                  </p>
                                ) : null}
                                {displayValue == null ? (
                                  <p className="text-xs text-gray-500">
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
                                className="text-blue-600 hover:underline"
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

        <div className="flex items-center gap-4 mt-10">
          <div className="flex-1 h-px bg-gray-300"></div>
          <span className="text-lg font-semibold text-gray-700">
            Liabilities
          </span>
          <div className="flex-1 h-px bg-gray-300"></div>
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
                  <span className="text-lg font-medium text-red-600">
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
                            className="bg-white shadow rounded-2xl p-4 flex items-center justify-between"
                          >
                            <div className="flex flex-col">
                              <div className="flex items-center gap-2">
                                <p className="font-semibold text-gray-900">
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
                                <p className="text-lg font-semibold text-gray-900">
                                  {displayValue != null
                                    ? formatCurrency(displayValue, baseCurrency)
                                    : `Unavailable in ${baseCurrency}`}
                                </p>
                                <p className="text-xs text-gray-500">
                                  {getValuationLabel(asset)}
                                </p>
                              </div>

                              <button
                                type="button"
                                onClick={() => setEditAssetId(asset.id)}
                                className="text-blue-600 hover:underline"
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
