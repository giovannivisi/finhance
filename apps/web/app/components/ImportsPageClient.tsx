"use client";

import Link from "next/link";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type CSSProperties,
  type FormEvent,
  type ReactNode,
} from "react";
import type {
  ImportBatchResponse,
  ImportFileType,
  ImportPreviewResponse,
  ImportRowIssueResponse,
} from "@finhance/shared";
import { apiMutation, fetchApiMutation, readApiError } from "@lib/api";
import {
  getImportReadiness,
  groupImportSummaries,
  splitImportIssues,
} from "@lib/imports";
import type { ImportPrivacySummary } from "@lib/privacy-notice";
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
  {
    file: "expenseCategoryHierarchy",
    href: "/import-templates/expenseCategoryHierarchy.csv",
  },
  {
    file: "expenseValidationRules",
    href: "/import-templates/expenseValidationRules.csv",
  },
];

const IMPORT_FILE_LABELS: Record<ImportFileType, string> = {
  accounts: "Accounts",
  categories: "Categories",
  assets: "Assets",
  transactions: "Transactions",
  recurringRules: "Recurring rules",
  recurringExceptions: "Recurring exceptions",
  budgets: "Budgets",
  budgetOverrides: "Budget overrides",
  expenseCategoryHierarchy: "Expense category hierarchy",
  expenseValidationRules: "Expense validation rules",
};

const DATE_TIME_FORMATTER = new Intl.DateTimeFormat("it-IT", {
  dateStyle: "medium",
  timeStyle: "short",
});

type ImportDisclosureId = "apply" | "bestUse" | "privacy";
type ImportDisclosurePointerIntent = ImportDisclosureId | null;
type ImportDisclosureStyle = CSSProperties & {
  "--import-disclosure-arrow-left"?: string;
};
type ImportIssueSectionId = "errors" | "warnings";
type GroupedImportIssue = {
  file: ImportFileType;
  field: string | null;
  message: string;
  rowNumbers: number[];
};

const IMPORT_ISSUE_PREVIEW_LIMIT = 4;

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

function getImportFileLabel(file: string): string {
  return IMPORT_FILE_LABELS[file as ImportFileType] ?? file;
}

function groupImportIssues(
  issues: ImportRowIssueResponse[],
): GroupedImportIssue[] {
  const grouped = new Map<string, GroupedImportIssue>();

  for (const issue of issues) {
    const key = `${issue.file}::${issue.field ?? ""}::${issue.message}`;
    const existing = grouped.get(key);

    if (existing) {
      existing.rowNumbers.push(issue.rowNumber);
      continue;
    }

    grouped.set(key, {
      file: issue.file,
      field: issue.field,
      message: issue.message,
      rowNumbers: [issue.rowNumber],
    });
  }

  return Array.from(grouped.values())
    .map((issue) => ({
      ...issue,
      rowNumbers: [...issue.rowNumbers].sort((a, b) => a - b),
    }))
    .sort((left, right) => {
      if (right.rowNumbers.length !== left.rowNumbers.length) {
        return right.rowNumbers.length - left.rowNumbers.length;
      }

      if (left.file !== right.file) {
        return left.file.localeCompare(right.file);
      }

      return (left.rowNumbers[0] ?? 0) - (right.rowNumbers[0] ?? 0);
    });
}

function formatIssueRowPreview(rowNumbers: number[]): string {
  const preview = rowNumbers.slice(0, 6);
  const joined = preview.join(", ");

  if (rowNumbers.length > preview.length) {
    return `${joined} +${rowNumbers.length - preview.length} more`;
  }

  return joined;
}

export default function ImportsPageClient({
  initialBatches,
  privacySummary,
}: {
  initialBatches: ImportBatchResponse[];
  privacySummary: ImportPrivacySummary;
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
  const [activeDisclosure, setActiveDisclosure] =
    useState<ImportDisclosureId | null>(null);
  const [isRecentBatchesOpen, setIsRecentBatchesOpen] = useState(false);
  const [openIssueSections, setOpenIssueSections] = useState<
    Record<ImportIssueSectionId, boolean>
  >({
    errors: false,
    warnings: false,
  });
  const [showAllIssueSections, setShowAllIssueSections] = useState<
    Record<ImportIssueSectionId, boolean>
  >({
    errors: false,
    warnings: false,
  });
  const [popoverStyle, setPopoverStyle] = useState<ImportDisclosureStyle>({});
  const actions = useSingleFlightActions<"preview" | "apply" | "export">();
  const disclosureRef = useRef<HTMLDivElement | null>(null);
  const disclosureButtonRefs = useRef<
    Partial<Record<ImportDisclosureId, HTMLButtonElement | null>>
  >({});
  const disclosureCloseTimerRef = useRef<number | null>(null);
  const disclosurePointerIntentRef =
    useRef<ImportDisclosurePointerIntent>(null);

  const selectedCount = useMemo(
    () => Object.values(selectedFiles).filter(Boolean).length,
    [selectedFiles],
  );
  const previewReadiness = preview ? getImportReadiness(preview) : null;
  const previewGroups = preview ? groupImportSummaries(preview.summary) : [];
  const previewIssues = preview ? splitImportIssues(preview.issues) : null;

  useEffect(() => {
    if (!activeDisclosure) {
      return;
    }

    function handlePointerDown(event: MouseEvent) {
      if (!disclosureRef.current?.contains(event.target as Node)) {
        setActiveDisclosure(null);
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setActiveDisclosure(null);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [activeDisclosure]);

  useEffect(() => {
    if (!activeDisclosure) {
      setPopoverStyle({});
      return;
    }

    const disclosureId = activeDisclosure;
    const popoverWidthByDisclosure: Record<ImportDisclosureId, number> = {
      apply: 352,
      bestUse: 360,
      privacy: 420,
    };

    function updatePopoverPosition() {
      const shell = disclosureRef.current;
      const button = disclosureButtonRefs.current[disclosureId];

      if (!shell || !button) {
        return;
      }

      const shellRect = shell.getBoundingClientRect();
      const buttonRect = button.getBoundingClientRect();
      const fallbackTop =
        button.offsetTop +
        (button.offsetHeight || buttonRect.height || 42) +
        12;

      if (shellRect.width <= 0) {
        setPopoverStyle({
          left: "0px",
          top: `${fallbackTop}px`,
          width: `${popoverWidthByDisclosure[disclosureId]}px`,
          "--import-disclosure-arrow-left": "28px",
        });
        return;
      }

      const width = Math.min(
        popoverWidthByDisclosure[disclosureId],
        Math.max(shellRect.width - 16, 0),
      );
      const idealLeft =
        buttonRect.left - shellRect.left + buttonRect.width / 2 - width / 2;
      const clampedLeft = Math.min(
        Math.max(idealLeft, 0),
        Math.max(shellRect.width - width, 0),
      );
      const buttonCenter =
        buttonRect.left - shellRect.left + buttonRect.width / 2;
      const arrowLeft = Math.min(
        Math.max(buttonCenter - clampedLeft, 28),
        Math.max(width - 28, 28),
      );

      setPopoverStyle({
        left: `${clampedLeft}px`,
        top: `${fallbackTop + 2}px`,
        width: `${width}px`,
        "--import-disclosure-arrow-left": `${arrowLeft}px`,
      });
    }

    updatePopoverPosition();
    window.addEventListener("resize", updatePopoverPosition);
    window.addEventListener("scroll", updatePopoverPosition, true);

    return () => {
      window.removeEventListener("resize", updatePopoverPosition);
      window.removeEventListener("scroll", updatePopoverPosition, true);
    };
  }, [activeDisclosure]);

  useEffect(() => {
    return () => {
      clearDisclosureCloseTimer();
    };
  }, []);

  useEffect(() => {
    setOpenIssueSections({
      errors: false,
      warnings: false,
    });
    setShowAllIssueSections({
      errors: false,
      warnings: false,
    });
  }, [preview?.id]);

  function clearDisclosureCloseTimer() {
    if (disclosureCloseTimerRef.current !== null) {
      window.clearTimeout(disclosureCloseTimerRef.current);
      disclosureCloseTimerRef.current = null;
    }
  }

  function scheduleDisclosureClose() {
    clearDisclosureCloseTimer();
    disclosureCloseTimerRef.current = window.setTimeout(() => {
      setActiveDisclosure(null);
    }, 120);
  }

  function openDisclosure(disclosure: ImportDisclosureId) {
    clearDisclosureCloseTimer();
    setActiveDisclosure(disclosure);
  }

  function handleDisclosureToggle(disclosure: ImportDisclosureId) {
    clearDisclosureCloseTimer();
    setActiveDisclosure((current) =>
      current === disclosure ? null : disclosure,
    );
    disclosurePointerIntentRef.current = null;
  }

  const disclosureContent: Record<
    ImportDisclosureId,
    {
      title: string;
      panelClassName: string;
      body: ReactNode;
    }
  > = {
    apply: {
      title: "What apply does",
      panelClassName: "import-disclosure-panel--apply",
      body: (
        <ul className="import-disclosure-list">
          <li>
            Matches rows by import key and merges creates, updates, and
            unchanged rows safely.
          </li>
          <li>
            `transactions.csv` covers manual transactions only, not
            recurring-generated rows.
          </li>
          <li>
            Recurring-generated transactions are recreated from recurring rules
            and exceptions after apply.
          </li>
          <li>
            Opening balances, recurring definitions, budgets, and overrides are
            part of the round-trip package.
          </li>
        </ul>
      ),
    },
    bestUse: {
      title: "Best use of import/export",
      panelClassName: "import-disclosure-panel--best-use",
      body: (
        <p className="import-disclosure-copy">
          Import is best when you are starting from existing finance data or
          moving the same finhance model between workspaces. Export is a
          round-trip backup of definitions and manual history, not a raw dump of
          every generated occurrence.
        </p>
      ),
    },
    privacy: {
      title: "Import privacy",
      panelClassName: "import-disclosure-panel--privacy",
      body: (
        <div className="import-disclosure-privacy">
          <p className="import-disclosure-lead">{privacySummary.controller}</p>
          <dl className="import-disclosure-facts">
            <div className="import-disclosure-fact">
              <dt>Purpose</dt>
              <dd>{privacySummary.purpose}</dd>
            </div>
            <div className="import-disclosure-fact">
              <dt>Legal basis</dt>
              <dd>{privacySummary.legalBasis}</dd>
            </div>
            <div className="import-disclosure-fact">
              <dt>Retention</dt>
              <dd>{privacySummary.retention}</dd>
            </div>
            <div className="import-disclosure-fact">
              <dt>Recipients and transfers</dt>
              <dd>{privacySummary.recipients}</dd>
            </div>
            <div className="import-disclosure-fact">
              <dt>Rights</dt>
              <dd>{privacySummary.rights}</dd>
            </div>
          </dl>
          <Link
            href={privacySummary.fullNoticeHref}
            className="import-disclosure-link"
          >
            {privacySummary.fullNoticeLabel}
          </Link>
        </div>
      ),
    },
  };

  const disclosureButtons: Array<{
    id: ImportDisclosureId;
    label: string;
  }> = [
    { id: "apply", label: "What apply does" },
    { id: "bestUse", label: "Best use" },
    { id: "privacy", label: "Import privacy" },
  ];

  function updateFileSelection(
    file: ImportFileType,
    event: ChangeEvent<HTMLInputElement>,
  ) {
    const nextFile = event.target.files?.[0] ?? null;
    setSelectedFiles((previous) => ({
      ...previous,
      [file]: nextFile,
    }));
    event.target.value = "";
  }

  function clearFileSelection(file: ImportFileType) {
    setSelectedFiles((previous) => ({
      ...previous,
      [file]: null,
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
          formData.append(file, selected, `${file}.csv`);
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
    <div className="page-shell is-relaxed route-stack-desktop-xl">
      <section className="page-hero">
        <p className="page-kicker">Migration</p>
        <h1 className="page-title is-compact">Import & export</h1>
        <p className="page-description">
          Use the CSV round-trip flow to establish a clean baseline, preview
          merges safely, and carry definitions like recurring rules and budgets
          without losing the monthly workflow.
        </p>
      </section>

      <section className="page-section page-section--allow-overflow import-disclosure-section section-stack-tight">
        <div className="compact-toolbar">
          <div>
            <h2 className="section-title">Templates and round-trip export</h2>
            <p className="section-subtitle">
              Download the CSV schema, or export the full package before
              previewing inbound files.
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
          <p role="alert" className="page-inline-notice surface-danger">
            {exportError}
          </p>
        ) : null}

        <div
          ref={disclosureRef}
          className="import-disclosure-shell"
          onMouseLeave={scheduleDisclosureClose}
          onBlurCapture={(event) => {
            const nextTarget = event.relatedTarget as Node | null;
            if (!disclosureRef.current?.contains(nextTarget)) {
              clearDisclosureCloseTimer();
              setActiveDisclosure(null);
            }
          }}
        >
          <div className="import-disclosure-rail">
            {disclosureButtons.map((button) => {
              const isActive = activeDisclosure === button.id;

              return (
                <button
                  key={button.id}
                  ref={(node) => {
                    disclosureButtonRefs.current[button.id] = node;
                  }}
                  type="button"
                  aria-expanded={isActive}
                  aria-controls={`import-disclosure-${button.id}`}
                  onPointerDown={() => {
                    disclosurePointerIntentRef.current = button.id;
                  }}
                  onClick={() => handleDisclosureToggle(button.id)}
                  onFocus={() => {
                    if (disclosurePointerIntentRef.current !== button.id) {
                      openDisclosure(button.id);
                    }
                  }}
                  onMouseEnter={() => openDisclosure(button.id)}
                  onMouseLeave={scheduleDisclosureClose}
                  className={`import-disclosure-trigger${
                    isActive ? " is-active" : ""
                  }`}
                >
                  {button.label}
                </button>
              );
            })}
          </div>

          {activeDisclosure ? (
            <div
              id={`import-disclosure-${activeDisclosure}`}
              role="region"
              aria-label={disclosureContent[activeDisclosure].title}
              style={popoverStyle}
              onMouseEnter={clearDisclosureCloseTimer}
              onMouseLeave={scheduleDisclosureClose}
              className={`import-disclosure-panel ${disclosureContent[activeDisclosure].panelClassName}`}
            >
              <h2 className="import-disclosure-panel-title">
                {disclosureContent[activeDisclosure].title}
              </h2>
              <div className="import-disclosure-panel-body">
                {disclosureContent[activeDisclosure].body}
              </div>
            </div>
          ) : null}
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {TEMPLATE_LINKS.map((template) => (
            <a
              key={template.file}
              href={template.href}
              download
              className="list-card is-compact text-sm font-medium text-[var(--text-primary)] transition hover:bg-[var(--bg-card-hover)]"
            >
              Download {template.file}.csv
            </a>
          ))}
        </div>
      </section>

      <section className="page-section section-stack-tight">
        <div>
          <h2 className="section-title">Preview inbound files</h2>
          <p className="section-subtitle">
            Choose only the CSVs you want to merge. Preview first, then apply
            from the result below.
          </p>
        </div>

        <form onSubmit={handlePreview} className="grid gap-6 lg:grid-cols-2">
          {TEMPLATE_LINKS.map((template) => {
            const selected = selectedFiles[template.file];
            const inputId = `import-file-${template.file}`;
            const fileLabel = IMPORT_FILE_LABELS[template.file];

            return (
              <label
                key={template.file}
                htmlFor={inputId}
                className="app-form-field import-file-field"
              >
                <span className="text-sm font-medium text-[var(--text-primary)]">
                  {fileLabel}
                </span>
                <input
                  id={inputId}
                  type="file"
                  accept=".csv,text/csv"
                  onChange={(event) =>
                    updateFileSelection(template.file, event)
                  }
                  className="sr-only"
                />
                <div
                  className={`import-file-picker${
                    selected ? " is-selected" : ""
                  }`}
                >
                  <div className="import-file-picker-action">
                    {selected ? "Replace CSV" : "Choose CSV"}
                  </div>
                  <div
                    className={`import-file-picker-status${
                      selected ? " is-selected" : ""
                    }`}
                  >
                    {selected ? `${fileLabel} selected` : "No file selected"}
                  </div>
                  {selected ? (
                    <button
                      type="button"
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        clearFileSelection(template.file);
                      }}
                      className="import-file-picker-clear"
                      aria-label={`Clear ${fileLabel} file`}
                    >
                      ×
                    </button>
                  ) : null}
                </div>
              </label>
            );
          })}

          <div className="compact-toolbar lg:col-span-2">
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
          <p
            role="alert"
            className="page-inline-notice surface-danger import-surface-superellipse"
          >
            {previewError}
          </p>
        ) : null}
      </section>

      {preview ? (
        <section className="page-section section-stack-tight">
          <div className="compact-toolbar">
            <div>
              <h2 className="section-title">Preview result</h2>
              <p className="section-subtitle">
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
            <p
              role="alert"
              className="page-inline-notice surface-danger import-surface-superellipse"
            >
              {applyError}
            </p>
          ) : null}

          {previewReadiness ? (
            <div
              className={`page-inline-notice ${
                previewReadiness.tone === "blocked"
                  ? "surface-danger"
                  : previewReadiness.tone === "warning"
                    ? "surface-warning"
                    : previewReadiness.tone === "success"
                      ? "surface-success"
                      : "surface-success"
              } import-surface-superellipse`}
            >
              <p
                className={`font-medium import-readiness-title${
                  previewReadiness.tone === "blocked" ? " is-blocked" : ""
                }`}
              >
                {previewReadiness.title}
              </p>
              <p className="mt-1 text-sm">{previewReadiness.detail}</p>
            </div>
          ) : null}

          <div className="import-preview-group-grid">
            {previewGroups.map((group) => (
              <section
                key={group.id}
                className="list-card is-muted import-preview-group-card"
              >
                <div className="import-preview-group-copy">
                  <h3 className="import-preview-group-title">{group.title}</h3>
                  <p className="import-preview-group-detail">{group.detail}</p>
                </div>

                <div className="import-preview-file-list">
                  {group.files.map((fileSummary) => (
                    <article
                      key={fileSummary.file}
                      className="list-card import-preview-file-card"
                    >
                      <div className="import-preview-file-header">
                        <h4 className="import-preview-file-title">
                          {getImportFileLabel(fileSummary.file)}
                        </h4>
                        <span className="import-preview-file-rows">
                          {fileSummary.createCount +
                            fileSummary.updateCount +
                            fileSummary.unchangedCount}{" "}
                          rows
                        </span>
                      </div>
                      <dl className="import-preview-stat-grid">
                        <div className="import-preview-stat-card">
                          <dt>Create</dt>
                          <dd>{fileSummary.createCount}</dd>
                        </div>
                        <div className="import-preview-stat-card">
                          <dt>Update</dt>
                          <dd>{fileSummary.updateCount}</dd>
                        </div>
                        <div className="import-preview-stat-card">
                          <dt>Unchanged</dt>
                          <dd>{fileSummary.unchangedCount}</dd>
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
            <div className="import-issue-stack">
              {[
                {
                  id: "errors" as const,
                  title: "Blocking issues",
                  empty: "No blocking issues in this preview.",
                  tone: "red",
                  issues: previewIssues.errors,
                },
                {
                  id: "warnings" as const,
                  title: "Warnings to review",
                  empty: "No warnings in this preview.",
                  tone: "amber",
                  issues: previewIssues.warnings,
                },
              ].map((section) => (
                <section
                  key={section.title}
                  className={`import-issue-section ${
                    section.tone === "red" ? "is-error" : "is-warning"
                  }`}
                >
                  {(() => {
                    const groupedIssues = groupImportIssues(section.issues);
                    const visibleGroupedIssues = showAllIssueSections[
                      section.id
                    ]
                      ? groupedIssues
                      : groupedIssues.slice(0, IMPORT_ISSUE_PREVIEW_LIMIT);

                    return (
                      <>
                        <div className="import-issue-section-header">
                          <div className="import-issue-section-copy">
                            <h3
                              className={`text-lg font-semibold import-issue-title ${
                                section.tone === "red"
                                  ? "is-error"
                                  : "is-warning"
                              }`}
                            >
                              {section.title}
                            </h3>
                            <p
                              className={`import-issue-section-summary ${
                                section.tone === "red"
                                  ? "is-error"
                                  : "is-warning"
                              }`}
                            >
                              {section.issues.length}{" "}
                              {section.tone === "red"
                                ? `blocking issue${
                                    section.issues.length === 1 ? "" : "s"
                                  }`
                                : `warning${
                                    section.issues.length === 1 ? "" : "s"
                                  }`}
                            </p>
                          </div>
                          {section.issues.length > 0 ? (
                            <button
                              type="button"
                              onClick={() =>
                                setOpenIssueSections((current) => ({
                                  ...current,
                                  [section.id]: !current[section.id],
                                }))
                              }
                              className="btn-secondary import-issue-toggle"
                            >
                              {openIssueSections[section.id]
                                ? "Hide issues"
                                : `Show ${section.issues.length} ${
                                    section.tone === "red"
                                      ? "issues"
                                      : "warnings"
                                  }`}
                            </button>
                          ) : null}
                        </div>
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
                        ) : !openIssueSections[section.id] ? (
                          <p
                            className={`page-inline-notice surface-dashed import-surface-superellipse import-issue-hidden-note ${
                              section.tone === "red" ? "is-error" : "is-warning"
                            }`}
                          >
                            {section.issues.length}{" "}
                            {section.tone === "red" ? "issue" : "warning"}
                            {section.issues.length === 1 ? "" : "s"} hidden.
                            Open this section only when you want to inspect the
                            affected rows.
                          </p>
                        ) : (
                          <div className="import-issue-card-list">
                            {visibleGroupedIssues.map((issue, index) => (
                              <article
                                key={`${section.title}-${issue.file}-${issue.field ?? "fieldless"}-${issue.message}-${index}`}
                                className={`import-issue-card ${
                                  section.tone === "red"
                                    ? "is-error"
                                    : "is-warning"
                                }`}
                              >
                                <div className="import-issue-card-meta">
                                  <span
                                    className={`status-chip ${
                                      section.tone === "red"
                                        ? "is-danger"
                                        : "is-warning"
                                    }`}
                                  >
                                    {getImportFileLabel(issue.file)}
                                  </span>
                                  <span className="status-chip is-neutral">
                                    {issue.rowNumbers.length === 1
                                      ? `Row ${issue.rowNumbers[0]}`
                                      : `${issue.rowNumbers.length} rows`}
                                  </span>
                                  {issue.field ? (
                                    <span className="status-chip is-neutral">
                                      {issue.field}
                                    </span>
                                  ) : null}
                                </div>
                                <p className="import-issue-card-message">
                                  {issue.message}
                                </p>
                                {issue.rowNumbers.length > 1 ? (
                                  <p className="import-issue-card-rows">
                                    Rows{" "}
                                    {formatIssueRowPreview(issue.rowNumbers)}
                                  </p>
                                ) : null}
                              </article>
                            ))}
                            {groupedIssues.length >
                              IMPORT_ISSUE_PREVIEW_LIMIT &&
                            !showAllIssueSections[section.id] ? (
                              <button
                                type="button"
                                onClick={() =>
                                  setShowAllIssueSections((current) => ({
                                    ...current,
                                    [section.id]: true,
                                  }))
                                }
                                className="btn-secondary import-issue-toggle"
                              >
                                Show{" "}
                                {groupedIssues.length -
                                  IMPORT_ISSUE_PREVIEW_LIMIT}{" "}
                                more groups
                              </button>
                            ) : null}
                          </div>
                        )}
                      </>
                    );
                  })()}
                </section>
              ))}
            </div>
          ) : (
            <p className="page-inline-notice surface-success import-surface-superellipse">
              No validation issues found in this preview.
            </p>
          )}
        </section>
      ) : null}

      <section className="page-section section-stack-tight">
        <div className="compact-toolbar">
          <div>
            <h2 className="section-title">Recent batches</h2>
            <p className="section-subtitle">
              Preview and apply history stays visible here for auditability.
            </p>
          </div>
          {batches.length > 0 ? (
            <button
              type="button"
              onClick={() => setIsRecentBatchesOpen((current) => !current)}
              className="btn-secondary"
            >
              {isRecentBatchesOpen
                ? "Hide recent batches"
                : "Show recent batches"}
            </button>
          ) : null}
        </div>

        {batches.length === 0 ? (
          <div className="mt-6 page-inline-notice surface-dashed import-surface-superellipse">
            No import batches yet.
          </div>
        ) : !isRecentBatchesOpen ? (
          <div className="mt-6 page-inline-notice surface-dashed import-surface-superellipse">
            Recent batch history is hidden. Open it when you want to review past
            previews and applies.
          </div>
        ) : (
          <div className="mt-6 import-batch-list">
            {batches.map((batch) => (
              <article
                key={batch.id}
                className="list-card is-muted import-batch-card"
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
