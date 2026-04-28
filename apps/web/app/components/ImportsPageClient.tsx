"use client";

import { useMemo, useState, type ChangeEvent, type FormEvent } from "react";
import type {
  ImportBatchResponse,
  ImportFileType,
  ImportPreviewResponse,
} from "@finhance/shared";
import { apiMutation, fetchApiMutation, readApiError } from "@lib/api";
import {
  getImportReadiness,
  groupImportSummaries,
  splitImportIssues,
} from "@lib/imports";
import { useSingleFlightActions } from "@lib/single-flight";

const TEMPLATE_LINKS: Array<{ file: ImportFileType; href: string }> = [
  { file: "accounts", href: "/import-templates/accounts.csv" },
  { file: "categories", href: "/import-templates/categories.csv" },
  { file: "assets", href: "/import-templates/assets.csv" },
  { file: "transactions", href: "/import-templates/transactions.csv" },
  { file: "recurringRules", href: "/import-templates/recurringRules.csv" },
  {
    file: "recurringExceptions",
    href: "/import-templates/recurringExceptions.csv",
  },
  { file: "budgets", href: "/import-templates/budgets.csv" },
  {
    file: "budgetOverrides",
    href: "/import-templates/budgetOverrides.csv",
  },
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
  const previewReadiness = preview ? getImportReadiness(preview) : null;
  const previewGroups = preview ? groupImportSummaries(preview.summary) : [];
  const previewIssues = preview ? splitImportIssues(preview.issues) : null;

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
    <div className="page-shell">
      <section className="page-hero">
        <p className="page-kicker">Migration</p>
        <h1 className="page-title is-compact">Import & export</h1>
        <p className="page-description">
          Use the CSV round-trip flow to establish a clean baseline, preview
          merges safely, and carry definitions like recurring rules and budgets
          without losing the monthly workflow.
        </p>

        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          <div className="page-inline-notice surface-info">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-blue-800">
              What apply does
            </h2>
            <ul className="mt-3 space-y-2 text-sm text-blue-950">
              <li>
                Matches rows by import key and merges creates, updates, and
                unchanged rows safely.
              </li>
              <li>
                `transactions.csv` covers manual transactions only, not
                recurring-generated rows.
              </li>
              <li>
                Recurring-generated transactions are recreated from recurring
                rules and exceptions after apply.
              </li>
              <li>
                Opening balances, recurring definitions, budgets, and overrides
                are part of the round-trip package.
              </li>
            </ul>
          </div>

          <div className="page-inline-notice">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-700">
              Best use of import/export
            </h2>
            <p className="mt-3 text-sm text-gray-600">
              Import is best when you are starting from existing finance data or
              moving the same finhance model between workspaces. Export is a
              round-trip backup of definitions and manual history, not a raw
              dump of every generated occurrence.
            </p>
          </div>
        </div>

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

        <div className="mt-6 page-inline-notice">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-700">
                Export ZIP
              </h2>
              <p className="mt-1 text-sm text-gray-500">
                Download the full round-trip package, including opening
                balances, recurring rules and exceptions, and budget plans.
              </p>
            </div>

            <button
              type="button"
              onClick={() => void handleExport()}
              disabled={isExporting}
              className="btn-secondary"
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
              className="btn-primary"
            >
              {isPreviewing ? "Previewing..." : "Preview import"}
            </button>

            <p className="text-sm text-gray-500">
              {selectedCount === 0
                ? "No files selected yet."
                : `${selectedCount} file${selectedCount === 1 ? "" : "s"} selected. Preview first to see exactly what would merge.`}
            </p>
          </div>
        </form>

        {previewError ? (
          <p role="alert" className="page-inline-notice surface-danger">
            {previewError}
          </p>
        ) : null}
      </section>

      {preview ? (
        <section className="page-section">
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
                className="btn-primary"
              >
                {isApplying ? "Applying..." : "Apply import"}
              </button>
            ) : null}
          </div>

          {applyError ? (
            <p role="alert" className="page-inline-notice surface-danger">
              {applyError}
            </p>
          ) : null}

          {previewReadiness ? (
            <div
              className={`mt-6 rounded-2xl border p-4 ${
                previewReadiness.tone === "blocked"
                  ? "border-red-200 bg-red-50 text-red-950"
                  : previewReadiness.tone === "warning"
                    ? "border-amber-200 bg-amber-50 text-amber-950"
                    : "border-emerald-200 bg-emerald-50 text-emerald-950"
              }`}
            >
              <p className="font-medium">{previewReadiness.title}</p>
              <p className="mt-1 text-sm opacity-90">
                {previewReadiness.detail}
              </p>
            </div>
          ) : null}

          <div className="mt-6 grid gap-6 xl:grid-cols-3">
            {previewGroups.map((group) => (
              <section key={group.id} className="list-card is-muted">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-700">
                  {group.title}
                </h3>
                <p className="mt-1 text-sm text-gray-500">{group.detail}</p>

                <div className="mt-4 space-y-3">
                  {group.files.map((fileSummary) => (
                    <article key={fileSummary.file} className="list-card">
                      <div className="flex items-center justify-between gap-3">
                        <h4 className="text-sm font-medium text-gray-900">
                          {fileSummary.file}
                        </h4>
                        <span className="text-xs uppercase tracking-wide text-gray-500">
                          {fileSummary.createCount +
                            fileSummary.updateCount +
                            fileSummary.unchangedCount}{" "}
                          rows
                        </span>
                      </div>
                      <dl className="mt-3 grid gap-2 text-sm text-gray-600 sm:grid-cols-3">
                        <div className="rounded-xl bg-gray-50 px-3 py-2">
                          <dt>Create</dt>
                          <dd className="mt-1 font-medium text-gray-900">
                            {fileSummary.createCount}
                          </dd>
                        </div>
                        <div className="rounded-xl bg-gray-50 px-3 py-2">
                          <dt>Update</dt>
                          <dd className="mt-1 font-medium text-gray-900">
                            {fileSummary.updateCount}
                          </dd>
                        </div>
                        <div className="rounded-xl bg-gray-50 px-3 py-2">
                          <dt>Unchanged</dt>
                          <dd className="mt-1 font-medium text-gray-900">
                            {fileSummary.unchangedCount}
                          </dd>
                        </div>
                      </dl>
                    </article>
                  ))}
                </div>
              </section>
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

          {previewIssues && preview.issues.length > 0 ? (
            <div className="mt-6 space-y-6">
              {[
                {
                  title: "Blocking issues",
                  empty: "No blocking issues in this preview.",
                  tone: "red",
                  issues: previewIssues.errors,
                },
                {
                  title: "Warnings to review",
                  empty: "No warnings in this preview.",
                  tone: "amber",
                  issues: previewIssues.warnings,
                },
              ].map((section) => (
                <section key={section.title}>
                  <h3 className="text-lg font-semibold text-gray-900">
                    {section.title}
                  </h3>
                  {section.issues.length === 0 ? (
                    <p
                      className={`mt-2 text-sm ${
                        section.tone === "red"
                          ? "text-emerald-700"
                          : "text-gray-500"
                      }`}
                    >
                      {section.empty}
                    </p>
                  ) : (
                    <div className="table-shell">
                      <table className="data-table">
                        <thead>
                          <tr>
                            <th className="pb-2 pr-4">File</th>
                            <th className="pb-2 pr-4">Row</th>
                            <th className="pb-2 pr-4">Field</th>
                            <th className="pb-2 pr-4">Message</th>
                          </tr>
                        </thead>
                        <tbody>
                          {section.issues.map((issue, index) => (
                            <tr
                              key={`${section.title}-${issue.file}-${issue.rowNumber}-${index}`}
                              className={
                                section.tone === "red"
                                  ? "bg-red-50/50"
                                  : "bg-amber-50/40"
                              }
                            >
                              <td className="py-2 pr-4 align-top font-medium">
                                {issue.file}
                              </td>
                              <td className="py-2 pr-4 align-top">
                                {issue.rowNumber}
                              </td>
                              <td className="py-2 pr-4 align-top">
                                {issue.field ?? "—"}
                              </td>
                              <td className="py-2 pr-4 align-top">
                                {issue.message}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </section>
              ))}
            </div>
          ) : (
            <p className="page-inline-notice surface-success">
              No validation issues found in this preview.
            </p>
          )}
        </section>
      ) : null}

      <section className="page-section">
        <h2 className="text-2xl font-semibold text-gray-900">Recent batches</h2>
        <p className="mt-1 text-sm text-gray-500">
          Preview and apply history stays visible here for auditability.
        </p>

        {batches.length === 0 ? (
          <div className="mt-6 page-inline-notice surface-dashed">
            No import batches yet.
          </div>
        ) : (
          <div className="mt-6 space-y-3">
            {batches.map((batch) => (
              <article key={batch.id} className="list-card is-muted">
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
                    {batch.summary.errorCount} blocking •{" "}
                    {batch.summary.warningCount} warnings
                  </div>
                </div>

                <div className="mt-3 space-y-3 text-xs text-gray-500">
                  {groupImportSummaries(batch.summary).map((group) => (
                    <div key={`${batch.id}-${group.id}`}>
                      <p className="font-medium uppercase tracking-wide text-gray-600">
                        {group.title}
                      </p>
                      <div className="mt-1 flex flex-wrap gap-3">
                        {group.files.map((fileSummary) => (
                          <span key={`${batch.id}-${fileSummary.file}`}>
                            {fileSummary.file}: {fileSummary.createCount}{" "}
                            create, {fileSummary.updateCount} update,{" "}
                            {fileSummary.unchangedCount} unchanged
                          </span>
                        ))}
                      </div>
                    </div>
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
