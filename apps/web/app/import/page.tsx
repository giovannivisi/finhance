import Link from "next/link";
import Container from "@components/Container";
import ImportsPageClient from "@components/ImportsPageClient";
import WorkflowSection from "@components/WorkflowSection";
import { api } from "@lib/api";
import type {
  ImportBatchResponse,
  SetupStatusResponse,
} from "@finhance/shared";
import { getCurrentRomeMonth } from "@lib/budgets";
import { getPrivacyNoticeConfig } from "@lib/privacy-notice";
import { getWorkflowCards } from "@lib/workflow";

export const dynamic = "force-dynamic";

export default async function ImportPage() {
  const privacyNotice = getPrivacyNoticeConfig();
  let batches: ImportBatchResponse[] | null = null;
  let setup: SetupStatusResponse | null = null;
  let errorMessage: string | null = null;

  try {
    batches = await api<ImportBatchResponse[]>("/imports");
  } catch (error) {
    errorMessage =
      error instanceof Error ? error.message : "Import data is unavailable.";
  }

  if (batches) {
    try {
      setup = await api<SetupStatusResponse>(
        "/setup/status?includeWarnings=false",
      );
    } catch {
      setup = null;
    }
  }

  return (
    <>
      <Container>
        {!batches ? (
          <>
            <section className="page-shell">
              <div className="page-hero">
                <p className="page-kicker">Migration</p>
                <h1 className="page-title is-compact">Import</h1>
              </div>
              <div className="page-inline-notice surface-danger">
                <p className="font-medium">
                  The web app could not reach the API.
                </p>
                <p>{errorMessage ?? "Start the API and refresh the page."}</p>
                <p className="mt-3 text-sm">
                  You can still review the{" "}
                  <Link href="/privacy" className="import-disclosure-link">
                    privacy notice
                  </Link>{" "}
                  before importing files.
                </p>
              </div>
            </section>
          </>
        ) : (
          <div className="page-shell">
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
        )}
      </Container>
    </>
  );
}
