"use client";

import { useEffect, useState } from "react";
import type { NetWorthSnapshotResponse } from "@finhance/shared";
import Container from "@components/Container";
import HistoryPageClient from "@components/HistoryPageClient";
import RouteLoadingShell from "@components/RouteLoadingShell";
import { api } from "@lib/api";

export default function HistoryRouteClient() {
  const [snapshots, setSnapshots] = useState<NetWorthSnapshotResponse[] | null>(
    null,
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let isActive = true;

    api<NetWorthSnapshotResponse[]>("/snapshots")
      .then((nextSnapshots) => {
        if (isActive) {
          setSnapshots(nextSnapshots);
        }
      })
      .catch((error: unknown) => {
        if (isActive) {
          setErrorMessage(
            error instanceof Error
              ? error.message
              : "Snapshot data is currently unavailable.",
          );
        }
      });

    return () => {
      isActive = false;
    };
  }, []);

  if (errorMessage) {
    return (
      <Container>
        <section className="page-shell">
          <div className="page-hero">
            <p className="page-kicker">Trend</p>
            <h1 className="page-title is-compact">History</h1>
          </div>
          <div className="page-inline-notice surface-warning">
            <p className="font-medium">The web app could not reach the API.</p>
            <p className="mt-2 text-sm">{errorMessage}</p>
          </div>
        </section>
      </Container>
    );
  }

  if (!snapshots) {
    return <RouteLoadingShell kicker="Trend" title="History" />;
  }

  return (
    <Container>
      <HistoryPageClient snapshots={snapshots} />
    </Container>
  );
}
