"use client";

import { useEffect, useMemo, useState } from "react";
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
      <SectionHeader title="Asset Allocation" />

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm text-onSurfaceVariant">{refreshStatus}</p>
          {refreshError ? (
            <p className="mt-1 text-sm text-tertiary">{refreshError}</p>
          ) : null}
        </div>

        <button
          type="button"
          onClick={handleRefresh}
          disabled={isRefreshing}
          className="text-sm px-3 py-1.5 rounded-lg bg-surfaceContainerLowest shadow hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isRefreshing ? "Refreshing..." : "Refresh"}
        </button>
      </div>

      <div className="bg-surfaceContainerLowest shadow-ambient rounded-xl md:rounded-[3rem] p-10 flex items-center justify-center mx-auto my-6">
        <div className="w-[520px] h-[520px]">
          <AllocationChart
            size={520}
            data={kindTotalsArray.map((kindTotal) => ({
              label: kindTotal.kind,
              total: kindTotal.total,
            }))}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-6 mt-6">
        {kindTotalsArray.map(({ kind, total }) => (
          <div
            key={kind}
            className="bg-surfaceContainerLowest shadow-ambient rounded-xl md:rounded-[3rem] p-6 text-center"
          >
            <p className="text-md font-medium text-onSurface">{kind}</p>
            <p className="text-2xl font-bold text-onSurface mt-1">
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
          <div className="flex-1 h-px bg-outlineVariant/30"></div>
          <span className="text-lg font-semibold text-onSurface">Assets</span>
          <div className="flex-1 h-px bg-outlineVariant/30"></div>
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
                  <span className="text-lg font-medium text-onSurface">
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
                            className="bg-surfaceContainerLowest shadow-ambient rounded-xl md:rounded-[3rem] p-4 flex items-center justify-between"
                          >
                            <div className="flex flex-col">
                              <div className="flex items-center gap-2">
                                <p className="font-semibold text-onSurface">
                                  {asset.name}
                                </p>
                                {asset.ticker ? (
                                  <span className="text-xs text-onSurfaceVariant">
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
                                <p className="text-lg font-semibold text-onSurface">
                                  {displayValue != null
                                    ? formatCurrency(displayValue, baseCurrency)
                                    : `Unavailable in ${baseCurrency}`}
                                </p>
                                <p className="text-xs text-onSurfaceVariant">
                                  {getValuationLabel(asset)}
                                </p>
                                {referenceDiffers ? (
                                  <p className="text-xs text-onSurfaceVariant">
                                    Ref:{" "}
                                    {formatCurrency(
                                      asset.referenceValue!,
                                      baseCurrency,
                                    )}
                                  </p>
                                ) : null}
                                {displayValue == null ? (
                                  <p className="text-xs text-onSurfaceVariant">
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
                                className="text-primary hover:underline"
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
          <div className="flex-1 h-px bg-outlineVariant/30"></div>
          <span className="text-lg font-semibold text-onSurface">
            Liabilities
          </span>
          <div className="flex-1 h-px bg-outlineVariant/30"></div>
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
                  <span className="text-lg font-medium text-tertiary">
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
                            className="bg-surfaceContainerLowest shadow-ambient rounded-xl md:rounded-[3rem] p-4 flex items-center justify-between"
                          >
                            <div className="flex flex-col">
                              <div className="flex items-center gap-2">
                                <p className="font-semibold text-onSurface">
                                  {asset.name}
                                </p>
                              </div>

                              <div className="flex flex-wrap items-center gap-2 mt-1">
                                <span className="px-2 py-0.5 rounded-full text-xs font-medium text-white bg-tertiary text-onPrimary">
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
                                <p className="text-lg font-semibold text-onSurface">
                                  {displayValue != null
                                    ? formatCurrency(displayValue, baseCurrency)
                                    : `Unavailable in ${baseCurrency}`}
                                </p>
                                <p className="text-xs text-onSurfaceVariant">
                                  {getValuationLabel(asset)}
                                </p>
                              </div>

                              <button
                                type="button"
                                onClick={() => setEditAssetId(asset.id)}
                                className="text-primary hover:underline"
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
