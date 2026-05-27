import type { NetWorthSnapshotResponse } from "@finhance/shared";
import Container from "@components/Container";

import HistoryPageClient from "@components/HistoryPageClient";
import { api } from "@lib/server-api";

export const dynamic = "force-dynamic";

export default async function HistoryPage() {
  let snapshots: NetWorthSnapshotResponse[] | null = null;
  let errorMessage: string | null = null;

  try {
    snapshots = await api<NetWorthSnapshotResponse[]>("/snapshots");
  } catch (error) {
    errorMessage =
      error instanceof Error
        ? error.message
        : "Snapshot data is currently unavailable.";
  }

  return (
    <>
      <Container>
        {!snapshots ? (
          <section className="page-shell">
            <div className="page-hero">
              <p className="page-kicker">Trend</p>
              <h1 className="page-title is-compact">History</h1>
            </div>
            <div className="page-inline-notice surface-warning">
              <p className="font-medium">
                The web app could not reach the API.
              </p>
              <p className="mt-2 text-sm">
                {errorMessage ?? "Start the API and refresh the page."}
              </p>
            </div>
          </section>
        ) : (
          <HistoryPageClient snapshots={snapshots} />
        )}
      </Container>
    </>
  );
}
