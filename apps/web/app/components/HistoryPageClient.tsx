"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { NetWorthSnapshotResponse } from "@finhance/shared";
import { formatCurrency } from "@lib/format";
import NetWorthHistoryChart from "@components/NetWorthHistoryChart";
import { getRepeatedActionNotice } from "@lib/request-safety";
import { requestSnapshotCapture } from "@lib/snapshot-capture";
import { useSingleFlightActions } from "@lib/single-flight";

const DATETIME_FORMATTER = new Intl.DateTimeFormat("it-IT", {
  dateStyle: "medium",
  timeStyle: "short",
});

export default function HistoryPageClient({
  snapshots,
}: {
  snapshots: NetWorthSnapshotResponse[];
}) {
  const router = useRouter();
  const [captureError, setCaptureError] = useState<string | null>(null);
  const [captureNotice, setCaptureNotice] = useState<string | null>(null);
  const [isCapturing, setIsCapturing] = useState(false);
  const actions = useSingleFlightActions<"capture">();
  const baseCurrency = snapshots[0]?.baseCurrency ?? "EUR";

  async function handleCapture() {
    await actions.run("capture", async () => {
      setCaptureError(null);
      setCaptureNotice(null);
      setIsCapturing(true);

      try {
        const result = await requestSnapshotCapture();
        if (!result.ok) {
          const repeatedActionNotice = getRepeatedActionNotice({
            status: result.status,
            error: result.error,
          });

          if (repeatedActionNotice) {
            setCaptureNotice(repeatedActionNotice);
            return;
          }

          setCaptureError(result.error);
          return;
        }

        router.refresh();
      } catch (error) {
        setCaptureError(
          error instanceof Error
            ? error.message
            : "Unable to capture snapshot.",
        );
      } finally {
        setIsCapturing(false);
      }
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold text-gray-900">
            Net worth history
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Daily snapshots of your derived portfolio totals in Europe/Rome.
          </p>
        </div>

        <button
          type="button"
          onClick={handleCapture}
          disabled={isCapturing}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isCapturing ? "Capturing..." : "Capture snapshot"}
        </button>
      </div>

      {captureError ? (
        <p role="alert" className="text-sm text-red-600">
          {captureError}
        </p>
      ) : null}
      {captureNotice ? (
        <p className="text-sm text-amber-700">{captureNotice}</p>
      ) : null}

      {snapshots.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-gray-300 bg-white p-10 text-center">
          <h2 className="text-xl font-semibold text-gray-900">
            No snapshots yet
          </h2>
          <p className="mt-2 text-sm text-gray-500">
            Capture your first snapshot to start tracking daily net worth
            history.
          </p>
        </div>
      ) : (
        <>
          <section className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-gray-100">
            <h2 className="text-lg font-semibold text-gray-900">Trend</h2>
            <p className="mt-1 text-sm text-gray-500">
              Stored daily net worth based on the current dashboard valuation
              rules.
            </p>

            <div className="mt-6">
              <NetWorthHistoryChart
                snapshots={snapshots}
                baseCurrency={baseCurrency}
              />
            </div>
          </section>

          <section className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-gray-100">
            <h2 className="text-lg font-semibold text-gray-900">Snapshots</h2>

            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 text-sm">
                <thead>
                  <tr className="text-left text-gray-500">
                    <th className="pb-3 pr-4 font-medium">Date</th>
                    <th className="pb-3 pr-4 font-medium">Net Worth</th>
                    <th className="pb-3 pr-4 font-medium">Assets</th>
                    <th className="pb-3 pr-4 font-medium">Liabilities</th>
                    <th className="pb-3 pr-4 font-medium">Status</th>
                    <th className="pb-3 font-medium">Captured</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {snapshots
                    .slice()
                    .reverse()
                    .map((snapshot) => (
                      <tr key={snapshot.id} className="text-gray-700">
                        <td className="py-3 pr-4 font-medium text-gray-900">
                          {snapshot.snapshotDate}
                        </td>
                        <td className="py-3 pr-4">
                          {formatCurrency(
                            snapshot.netWorthTotal,
                            snapshot.baseCurrency,
                          )}
                        </td>
                        <td className="py-3 pr-4">
                          {formatCurrency(
                            snapshot.assetsTotal,
                            snapshot.baseCurrency,
                          )}
                        </td>
                        <td className="py-3 pr-4">
                          {formatCurrency(
                            snapshot.liabilitiesTotal,
                            snapshot.baseCurrency,
                          )}
                        </td>
                        <td className="py-3 pr-4">
                          {snapshot.isPartial
                            ? `Partial (${snapshot.unavailableCount} unavailable)`
                            : "Complete"}
                        </td>
                        <td className="py-3">
                          {DATETIME_FORMATTER.format(
                            new Date(snapshot.capturedAt),
                          )}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
