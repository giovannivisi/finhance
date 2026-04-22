"use client";

import { useMemo, useState, type ChangeEvent, type FormEvent } from "react";
import type {
  ImportBatchResponse,
  ImportFileType,
  ImportPreviewResponse,
} from "@finhance/shared";
import { apiMutation, fetchApiMutation, readApiError } from "@lib/api";
import { useSingleFlightActions } from "@lib/single-flight";

const TEMPLATE_LINKS: Array<{ file: ImportFileType; href: string }> = [
  { file: "accounts", href: "/import-templates/accounts.csv" },
  { file: "categories", href: "/import-templates/categories.csv" },
  { file: "assets", href: "/import-templates/assets.csv" },
  { file: "transactions", href: "/import-templates/transactions.csv" },
];

const DATE_TIME_FORMATTER = new Intl.DateTimeFormat("it-IT", {
  dateStyle: "medium",
  timeStyle: "short",
});

function upsertBatch(
  batches: ImportBatchResponse[],
  nextBatch: ImportBatchResponse,
): ImportBatchResponse[] {
  return [
    nextBatch,
    ...batches.filter((batch) => batch.id !== nextBatch.id),
  ].slice(0, 20);
}

function getDownloadFilename(contentDisposition: string | null): string | null {
  if (!contentDisposition) {
    return null;
  }

  const match = /filename="([^"]+)"/i.exec(contentDisposition);
  return match?.[1] ?? null;
}

export default function ImportsPageClient({
  initialBatches,
}: {
  initialBatches: ImportBatchResponse[];
}) {
  const [selectedFiles, setSelectedFiles] = useState<
    Partial<Record<ImportFileType, File | null>>
  >({});
  const [batches, setBatches] = useState(initialBatches);
  const [preview, setPreview] = useState<ImportPreviewResponse | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [applyError, setApplyError] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const actions = useSingleFlightActions<"preview" | "apply" | "export">();

  const selectedCount = useMemo(
    () => Object.values(selectedFiles).filter(Boolean).length,
    [selectedFiles],
  );

  function updateFileSelection(
    file: ImportFileType,
    event: ChangeEvent<HTMLInputElement>,
  ) {
    setSelectedFiles((previous) => ({
      ...previous,
      [file]: event.target.files?.[0] ?? null,
    }));
  }

  async function handlePreview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await actions.run("preview", async () => {
      setPreviewError(null);
      setApplyError(null);
      setExportError(null);
      setPreview(null);

      if (selectedCount === 0) {
        setPreviewError("Choose at least one CSV file to preview.");
        return;
      }

      const formData = new FormData();
      for (const file of TEMPLATE_LINKS.map((entry) => entry.file)) {
        const selected = selectedFiles[file];
        if (selected) {
          formData.append(file, selected, selected.name);
        }
      }

      setIsPreviewing(true);

      try {
        const result = await apiMutation<ImportPreviewResponse>(
          "/imports/csv/preview",
          {
            method: "POST",
            body: formData,
          },
        );
        setPreview(result);
        setBatches((previous) => upsertBatch(previous, result));
      } catch (error) {
        setPreviewError(
          error instanceof Error
            ? error.message
            : "Unable to preview this import.",
        );
      } finally {
        setIsPreviewing(false);
      }
    });
  }

  async function handleApply() {
    await actions.run("apply", async () => {
      if (!preview?.canApply) {
        return;
      }

      setApplyError(null);
      setIsApplying(true);

      try {
        const applied = await apiMutation<ImportBatchResponse>(
          `/imports/${preview.id}/apply`,
          {
            method: "POST",
          },
        );
        setPreview({ ...applied, canApply: false });
        setBatches((previous) => upsertBatch(previous, applied));
      } catch (error) {
        setApplyError(
          error instanceof Error
            ? error.message
            : "Unable to apply this import.",
        );
      } finally {
        setIsApplying(false);
      }
    });
  }

  async function handleExport() {
    await actions.run("export", async () => {
      setExportError(null);
      setIsExporting(true);

      try {
        const response = await fetchApiMutation("/imports/csv/export", {
          method: "POST",
        });

        if (!response.ok) {
          setExportError(await readApiError(response));
          return;
        }

        const blob = await response.blob();
        const objectUrl = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = objectUrl;
        link.download =
          getDownloadFilename(response.headers.get("content-disposition")) ??
          "finhance-export.zip";
        document.body.append(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(objectUrl);
      } catch (error) {
        setExportError(
          error instanceof Error
            ? error.message
            : "Unable to export this data.",
        );
      } finally {
        setIsExporting(false);
      }
    });
  }

  return (
    <div className="space-y-8">
      <section className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-gray-100">
        <h1 className="text-3xl font-semibold text-gray-900">
          Import & export
        </h1>
        <p className="mt-2 text-sm text-gray-500">
          Upload finhance CSV templates to preview safe merges before applying
          them, or export a round-trip ZIP backup of your current data.
        </p>

        <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {TEMPLATE_LINKS.map((template) => (
            <a
              key={template.file}
              href={template.href}
              download
              className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm font-medium text-gray-700 hover:bg-gray-100"
            >
              Download {template.file}.csv
            </a>
          ))}
        </div>

        <div className="mt-6 rounded-2xl border border-gray-200 bg-gray-50 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-700">
                Export ZIP
              </h2>
              <p className="mt-1 text-sm text-gray-500">
                Download accounts, categories, assets, and transactions in the
                same CSV template format used by import.
              </p>
            </div>

            <button
              type="button"
              onClick={() => void handleExport()}
              disabled={isExporting}
              className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-900 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isExporting ? "Exporting..." : "Export ZIP"}
            </button>
          </div>

          {exportError ? (
            <p role="alert" className="mt-3 text-sm text-red-600">
              {exportError}
            </p>
          ) : null}
        </div>

        <form
          onSubmit={handlePreview}
          className="mt-8 grid gap-6 lg:grid-cols-2"
        >
          {TEMPLATE_LINKS.map((template) => (
            <label key={template.file} className="flex flex-col gap-2">
              <span className="text-sm font-medium text-gray-700">
                {template.file}.csv
              </span>
              <input
                type="file"
                accept=".csv,text/csv"
                onChange={(event) => updateFileSelection(template.file, event)}
                className="rounded-xl border border-gray-300 px-3 py-2 text-sm"
              />
            </label>
          ))}

          <div className="lg:col-span-2 flex flex-wrap items-center gap-3">
            <button
              type="submit"
              disabled={isPreviewing}
              className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isPreviewing ? "Previewing..." : "Preview import"}
            </button>

            <p className="text-sm text-gray-500">
              {selectedCount === 0
                ? "No files selected yet."
                : `${selectedCount} file${selectedCount === 1 ? "" : "s"} selected.`}
            </p>
          </div>
        </form>

        {previewError ? (
          <p role="alert" className="mt-4 text-sm text-red-600">
            {previewError}
          </p>
        ) : null}
      </section>

      {preview ? (
        <section className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-gray-100">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-2xl font-semibold text-gray-900">
                Preview result
              </h2>
              <p className="mt-1 text-sm text-gray-500">
                Batch {preview.id} • {preview.status}
              </p>
            </div>

            {preview.canApply ? (
              <button
                type="button"
                onClick={() => void handleApply()}
                disabled={isApplying}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isApplying ? "Applying..." : "Apply import"}
              </button>
            ) : null}
          </div>

          {applyError ? (
            <p role="alert" className="mt-4 text-sm text-red-600">
              {applyError}
            </p>
          ) : null}

          <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {preview.summary.files.map((fileSummary) => (
              <article
                key={fileSummary.file}
                className="rounded-2xl border border-gray-200 bg-gray-50 p-4"
              >
                <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-700">
                  {fileSummary.file}
                </h3>
                <dl className="mt-3 space-y-1 text-sm text-gray-600">
                  <div className="flex justify-between gap-4">
                    <dt>Create</dt>
                    <dd>{fileSummary.createCount}</dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt>Update</dt>
                    <dd>{fileSummary.updateCount}</dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt>Unchanged</dt>
                    <dd>{fileSummary.unchangedCount}</dd>
                  </div>
                </dl>
              </article>
            ))}
          </div>

          <div className="mt-6 flex flex-wrap gap-6 text-sm text-gray-600">
            <span>Errors: {preview.summary.errorCount}</span>
            <span>Warnings: {preview.summary.warningCount}</span>
            <span>
              Created {DATE_TIME_FORMATTER.format(new Date(preview.createdAt))}
            </span>
            {preview.appliedAt ? (
              <span>
                Applied{" "}
                {DATE_TIME_FORMATTER.format(new Date(preview.appliedAt))}
              </span>
            ) : null}
          </div>

          {preview.issues.length > 0 ? (
            <div className="mt-6 overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 text-sm">
                <thead className="text-left text-gray-500">
                  <tr>
                    <th className="pb-2 pr-4">File</th>
                    <th className="pb-2 pr-4">Row</th>
                    <th className="pb-2 pr-4">Field</th>
                    <th className="pb-2 pr-4">Message</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 text-gray-700">
                  {preview.issues.map((issue, index) => (
                    <tr key={`${issue.file}-${issue.rowNumber}-${index}`}>
                      <td className="py-2 pr-4 align-top">{issue.file}</td>
                      <td className="py-2 pr-4 align-top">{issue.rowNumber}</td>
                      <td className="py-2 pr-4 align-top">
                        {issue.field ?? "—"}
                      </td>
                      <td className="py-2 pr-4 align-top">{issue.message}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="mt-6 text-sm text-green-700">
              No validation issues found in this preview.
            </p>
          )}
        </section>
      ) : null}

      <section className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-gray-100">
        <h2 className="text-2xl font-semibold text-gray-900">Recent batches</h2>
        <p className="mt-1 text-sm text-gray-500">
          Preview and apply history stays visible here for auditability.
        </p>

        {batches.length === 0 ? (
          <div className="mt-6 rounded-2xl border border-dashed border-gray-300 bg-gray-50 p-6 text-sm text-gray-500">
            No import batches yet.
          </div>
        ) : (
          <div className="mt-6 space-y-3">
            {batches.map((batch) => (
              <article
                key={batch.id}
                className="rounded-2xl border border-gray-200 bg-gray-50 p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold text-gray-900">
                      {batch.id}
                    </h3>
                    <p className="mt-1 text-sm text-gray-600">
                      {batch.status} • Created{" "}
                      {DATE_TIME_FORMATTER.format(new Date(batch.createdAt))}
                    </p>
                    {batch.appliedAt ? (
                      <p className="mt-1 text-sm text-gray-500">
                        Applied{" "}
                        {DATE_TIME_FORMATTER.format(new Date(batch.appliedAt))}
                      </p>
                    ) : null}
                  </div>

                  <div className="text-sm text-gray-600">
                    {batch.summary.errorCount} errors •{" "}
                    {batch.summary.warningCount} warnings
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap gap-3 text-xs text-gray-500">
                  {batch.summary.files.map((fileSummary) => (
                    <span key={`${batch.id}-${fileSummary.file}`}>
                      {fileSummary.file}: {fileSummary.createCount} create,{" "}
                      {fileSummary.updateCount} update,{" "}
                      {fileSummary.unchangedCount} unchanged
                    </span>
                  ))}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
