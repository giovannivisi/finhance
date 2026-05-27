"use client";

import { useEffect, useState } from "react";
import type {
  ImportBatchResponse,
  SetupStatusResponse,
} from "@finhance/shared";
import Container from "@components/Container";
import ImportsPageClient from "@components/ImportsPageClient";
import RouteLoadingShell from "@components/RouteLoadingShell";
import WorkflowSection from "@components/WorkflowSection";
import { api } from "@lib/api";
import { getCurrentRomeMonth } from "@lib/budgets";
import { getPrivacyNoticeConfig } from "@lib/privacy-notice";
import { getWorkflowCards } from "@lib/workflow";

export default function ImportRouteClient() {
  const [batches, setBatches] = useState<ImportBatchResponse[] | null>(null);
  const [setup, setSetup] = useState<SetupStatusResponse | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const privacyNotice = getPrivacyNoticeConfig();

  useEffect(() => {
    let isActive = true;

    Promise.all([
      api<ImportBatchResponse[]>("/imports"),
      api<SetupStatusResponse>("/setup/status?includeWarnings=false").catch(
        () => null,
      ),
    ])
      .then(([nextBatches, nextSetup]) => {
        if (!isActive) {
          return;
        }

        setBatches(nextBatches);
        setSetup(nextSetup);
      })
      .catch((error: unknown) => {
        if (isActive) {
          setErrorMessage(
            error instanceof Error
              ? error.message
              : "Import data is unavailable.",
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
            <p className="page-kicker">Migration</p>
            <h1 className="page-title is-compact">Import</h1>
          </div>
          <div className="page-inline-notice surface-danger">
            <p className="font-medium">The web app could not reach the API.</p>
            <p>{errorMessage}</p>
          </div>
        </section>
      </Container>
    );
  }

  if (!batches) {
    return <RouteLoadingShell kicker="Migration" title="Import" />;
  }

  return (
    <Container>
      <div className="page-shell is-relaxed route-stack-desktop-xl">
        <ImportsPageClient
          initialBatches={batches}
          privacySummary={privacyNotice.importSummary}
        />
        <WorkflowSection
          title="After import, keep the month connected"
          description={`Use import to establish or restore the baseline, then move directly into ${setup?.currentMonth ?? "the current month"} review, analytics, and budgets.`}
          cards={getWorkflowCards({
            currentPage: "import",
            month: setup?.currentMonth ?? getCurrentRomeMonth(),
            setup,
          })}
        />
      </div>
    </Container>
  );
}
