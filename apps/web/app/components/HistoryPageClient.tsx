"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAppPreferences } from "@components/ThemeProvider";
import type { NetWorthSnapshotResponse } from "@finhance/shared";
import { formatSensitiveCurrency } from "@lib/money";
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
  const reportingCurrency = snapshots[0]?.reportingCurrency ?? "EUR";
  const { hideMoney, isHydrated } = useAppPreferences();
  const shouldHideMoney = !isHydrated || hideMoney;

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
    <div className="page-shell">
      <section className="page-hero">
        <div className="page-hero-row">
          <div className="page-hero-copy">
            <p className="page-kicker">Trend</p>
            <h1 className="page-title is-compact">Net worth history</h1>
            <p className="page-description">
              Daily snapshots of your derived portfolio totals in Europe/Rome.
            </p>
          </div>

          <button
            type="button"
            onClick={handleCapture}
            disabled={isCapturing}
            className="btn-primary"
          >
            {isCapturing ? "Capturing..." : "Capture snapshot"}
          </button>
        </div>
      </section>

      {captureError ? (
        <p role="alert" className="page-inline-notice surface-danger">
          {captureError}
        </p>
      ) : null}
      {captureNotice ? (
        <p className="page-inline-notice surface-warning">{captureNotice}</p>
      ) : null}

      {snapshots.length === 0 ? (
        <div className="page-inline-notice surface-dashed text-center">
          <h2 className="text-xl font-semibold text-[var(--text-primary)]">
            No snapshots yet
          </h2>
          <p className="mt-2 text-sm">
            Capture your first snapshot to start tracking daily net worth
            history.
          </p>
        </div>
      ) : (
        <>
          <section className="page-section">
            <h2 className="text-lg font-semibold text-[var(--text-primary)]">
              Trend
            </h2>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">
              Stored daily net worth based on the current dashboard valuation
              rules.
            </p>

            <div className="mt-6">
              <NetWorthHistoryChart
                snapshots={snapshots}
                reportingCurrency={reportingCurrency}
              />
            </div>
          </section>

          <section className="page-section">
            <h2 className="text-lg font-semibold text-[var(--text-primary)]">
              Snapshots
            </h2>

            <div className="table-shell">
              <table className="data-table">
                <thead>
                  <tr>
                    <th className="pb-3 pr-4 font-medium">Date</th>
                    <th className="pb-3 pr-4 font-medium">Net Worth</th>
                    <th className="pb-3 pr-4 font-medium">Assets</th>
                    <th className="pb-3 pr-4 font-medium">Liabilities</th>
                    <th className="pb-3 pr-4 font-medium">Status</th>
                    <th className="pb-3 font-medium">Captured</th>
                  </tr>
                </thead>
                <tbody>
                  {snapshots
                    .slice()
                    .reverse()
                    .map((snapshot) => (
                      <tr key={snapshot.id}>
                        <td className="py-3 pr-4 font-medium text-[var(--text-primary)]">
                          {snapshot.snapshotDate}
                        </td>
                        <td className="py-3 pr-4">
                          {formatSensitiveCurrency(
                            snapshot.netWorthTotal,
                            snapshot.reportingCurrency,
                            shouldHideMoney,
                          )}
                        </td>
                        <td className="py-3 pr-4">
                          {formatSensitiveCurrency(
                            snapshot.assetsTotal,
                            snapshot.reportingCurrency,
                            shouldHideMoney,
                          )}
                        </td>
                        <td className="py-3 pr-4">
                          {formatSensitiveCurrency(
                            snapshot.liabilitiesTotal,
                            snapshot.reportingCurrency,
                            shouldHideMoney,
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
