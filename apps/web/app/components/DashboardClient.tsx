"use client";

import { useEffect, useState } from "react";
import CreateAssetModal from "@/components/CreateAssetModal";
import EditAssetModal from "@components/EditAssetModal";
import DeleteAssetButton from "@components/DeleteAssetButton";
import { formatCurrency } from "@lib/format";
import HeaderAddButton from "@components/HeaderAddButton";
import SectionHeader from "@components/SectionHeader";
import DisclosureIcon from "@components/DisclosureIcon";
import AllocationChart from "@components/AllocationChart";
import { ApiAsset } from "@lib/api-types";

export default function DashboardClient({
  grouped,
  kindTotalsArray,
  liabilities,
  lastUpdatedMs,
}: {
  grouped: Record<string, ApiAsset[]>;
  kindTotalsArray: { kind: string; total: number }[];
  liabilities: ApiAsset[];
  lastUpdatedMs?: number | null;
}) {
  const [editAssetId, setEditAssetId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [openCategories, setOpenCategories] = useState<Record<string, boolean>>({});
  const sortedCategories = Object.keys(grouped).sort();

  const [nowMs, setNowMs] = useState(Date.now());

  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  const updatedMinutesAgo =
    lastUpdatedMs != null && lastUpdatedMs > 0
      ? Math.max(0, Math.floor((nowMs - lastUpdatedMs) / 60000))
      : null;

  useEffect(() => {
    const initialState: Record<string, boolean> = {};
    Object.keys(grouped).forEach((cat) => {
      initialState[cat] = true;
    });
    setOpenCategories(initialState);
  }, [grouped]);

  function toggleCategory(category: string) {
    setOpenCategories((prev) => ({
      ...prev,
      [category]: !prev[category],
    }));
  }
  

  return (
    <>
    {/* ASSET ALLOCATION HEADER */}
    <SectionHeader title="Asset Allocation" />

    <div className="mt-6 flex items-center justify-between">
      <p className="text-sm text-gray-500">
        {updatedMinutesAgo == null
          ? "Prices not fetched yet"
          : `Updated ${updatedMinutesAgo} min ago`}
      </p>

      <a
        href="?refresh=1"
        className="text-sm px-3 py-1.5 rounded-lg bg-white shadow hover:bg-gray-50"
      >
        Refresh
      </a>
    </div>

    {/* FULL-WIDTH CHART */}
    <div className="bg-white shadow rounded-2xl p-10 flex items-center justify-center mx-auto my-6">
      <div className="w-[520px] h-[520px]">
        <AllocationChart
          size={520}
          data={kindTotalsArray.map(k => ({ label: k.kind, total: k.total }))}
        />
      </div>
    </div>

    {/* TOTALS BELOW CHART */}
    <div className="flex items-center justify-center grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-6 mt-6">
      {kindTotalsArray.map(({ kind, total }) => (
        <div key={kind} className="bg-white shadow rounded-2xl p-6 text-center">
          <p className="text-md font-medium text-gray-700">{kind}</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">
            {formatCurrency(total)}
          </p>
        </div>
      ))}
    </div>

    <SectionHeader
        title="Assets and liabilities"
        action={<HeaderAddButton onClick={() => setCreateOpen(true)} />}
     />
      {/* UNIFIED ASSETS + LIABILITIES LIST WITH DIVIDERS */}

      <div className="space-y-10 mt-6">
        {/* ASSET DIVIDER */}
        <div className="flex items-center gap-4">
          <div className="flex-1 h-px bg-gray-300"></div>
          <span className="text-lg font-semibold text-gray-700">Assets</span>
          <div className="flex-1 h-px bg-gray-300"></div>
        </div>

        {/* ASSET GROUPS */}
        <div className="space-y-6">
          {sortedCategories
            .filter((category) =>
              grouped[category].some((a) => a.type === "ASSET")
            )
            .map((category) => (
              <div key={category}>
                <button
                  onClick={() => toggleCategory(category)}
                  className="flex items-center justify-between w-full text-left"
                >
                  <span className="text-lg font-medium text-gray-900">{category}</span>
                  <DisclosureIcon open={openCategories[category]} />
                </button>

                {openCategories[category] && (
                  <ul className="space-y-2 mt-2 transition-all duration-200 ease-in-out">
                    {grouped[category]
                      .filter((asset) => asset.type === "ASSET")
                      .map((asset) => (
                        <li
                          key={asset.id}
                          className="bg-white shadow rounded-2xl p-4 flex items-center justify-between"
                        >
                          <div className="flex flex-col">
                            <div className="flex items-center gap-2">
                              <p className="font-semibold text-gray-900">{asset.name}</p>
                              {asset.ticker && (
                                <span className="text-xs text-gray-500">({asset.ticker})</span>
                              )}
                            </div>

                            <div className="flex items-center gap-2 mt-1">
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

                              {asset.quantity && (asset.lastPrice || asset.unitPrice) && (
                                <span className="text-xs text-gray-600">
                                 {asset.quantity} × {formatCurrency(Number(asset.lastPrice ?? asset.unitPrice ?? 0))}
                                  {""}
                                </span>
                              )}

                              {asset.notes && (
                                <span className="text-xs text-gray-400 italic truncate max-w-[150px]">
                                  {asset.notes}
                                </span>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center gap-4">
                            <div className="flex flex-col items-end">
                              <p className="text-lg font-semibold text-gray-900">
                                {formatCurrency(asset.currentValue ?? asset.balance)}
                              </p>
                              {/* {asset.currentValue != null && asset.currentValue !== asset.balance && (
                                <p className="text-xs text-gray-500">
                                  Ref: {formatCurrency(asset.balance)}
                                </p>
                              )} */}
                            </div>

                            <button
                              onClick={() => setEditAssetId(asset.id)}
                              className="text-blue-600 hover:underline"
                            >
                              Edit
                            </button>

                            <DeleteAssetButton id={asset.id} />
                          </div>
                        </li>
                      ))}
                  </ul>
                )}
              </div>
            ))}
        </div>

        {/* LIABILITY DIVIDER */}
        <div className="flex items-center gap-4 mt-10">
          <div className="flex-1 h-px bg-gray-300"></div>
          <span className="text-lg font-semibold text-gray-700">Liabilities</span>
          <div className="flex-1 h-px bg-gray-300"></div>
        </div>

        {/* LIABILITY GROUPS */}
        <div className="space-y-6">
          {sortedCategories
            .filter((category) =>
              grouped[category].some((a) => a.type === "LIABILITY")
            )
            .map((category) => (
              <div key={category}>
                <button
                  onClick={() => toggleCategory(category)}
                  className="flex items-center justify-between w-full text-left"
                >
                  <span className="text-lg font-medium text-red-600">{category}</span>
                  <DisclosureIcon open={openCategories[category]} />
                </button>

                {openCategories[category] && (
                  <ul className="space-y-2 mt-2 transition-all duration-200 ease-in-out">
                    {grouped[category]
                      .filter((asset) => asset.type === "LIABILITY")
                      .map((asset) => (
                        <li
                          key={asset.id}
                          className="bg-white shadow rounded-2xl p-4 flex items-center justify-between"
                        >
                          <div className="flex flex-col">
                            <div className="flex items-center gap-2">
                              <p className="font-semibold text-gray-900">{asset.name}</p>
                            </div>

                            <div className="flex items-center gap-2 mt-1">
                              <span className="px-2 py-0.5 rounded-full text-xs font-medium text-white bg-red-600">
                                {asset.liabilityKind}
                              </span>

                              {asset.notes && (
                                <span className="text-xs text-gray-400 italic truncate max-w-[150px]">
                                  {asset.notes}
                                </span>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center gap-4">
                            <p className="text-lg font-semibold text-gray-900">
                              {formatCurrency(asset.balance)}
                            </p>

                            <button
                              onClick={() => setEditAssetId(asset.id)}
                              className="text-blue-600 hover:underline"
                            >
                              Edit
                            </button>

                            <DeleteAssetButton id={asset.id} />
                          </div>
                        </li>
                      ))}
                  </ul>
                )}
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
