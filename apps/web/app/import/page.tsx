import Header from "@components/Header";
import Container from "@components/Container";
import ImportsPageClient from "@components/ImportsPageClient";
import { api } from "@lib/api";
import type { ImportBatchResponse } from "@finhance/shared";

export const dynamic = "force-dynamic";

export default async function ImportPage() {
  let batches: ImportBatchResponse[] | null = null;
  let errorMessage: string | null = null;

  try {
    batches = await api<ImportBatchResponse[]>("/imports");
  } catch (error) {
    errorMessage =
      error instanceof Error ? error.message : "Import data is unavailable.";
  }

  return (
    <>
      <Header />
      <Container>
        {!batches ? (
          <>
            <h1 className="text-3xl font-semibold text-gray-900">Import</h1>
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
          <ImportsPageClient initialBatches={batches} />
        )}
      </Container>
    </>
  );
}
