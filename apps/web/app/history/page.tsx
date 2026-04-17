import type { NetWorthSnapshotResponse } from "@finhance/shared";
import Container from "@components/Container";
import Header from "@components/Header";
import HistoryPageClient from "@components/HistoryPageClient";
import { api } from "@lib/api";

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
      <Header />
      <Container>
        {!snapshots ? (
          <>
            <h1 className="text-3xl font-semibold text-gray-900">History</h1>
            <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-6 text-amber-950">
              <p className="font-medium">
                The web app could not reach the API.
              </p>
              <p className="mt-2 text-sm text-amber-900/80">
                {errorMessage ?? "Start the API and refresh the page."}
              </p>
            </div>
          </>
        ) : (
          <HistoryPageClient snapshots={snapshots} />
        )}
      </Container>
    </>
  );
}
