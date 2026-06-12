"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type CSSProperties,
  type DragEvent,
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
  type ImportHeaderHint,
  inferImportFileTypeFromHeaders,
  readImportFileHeaders,
} from "@lib/import-upload";
import {
  getImportReadiness,
  groupImportSummaries,
  splitImportIssues,
} from "@lib/imports";
import { reloadPage } from "@lib/page-reload";
import type { ImportPrivacySummary } from "@lib/privacy-notice";
import { useSingleFlightActions } from "@lib/single-flight";

const IMPORT_FILE_ORDER: ImportFileType[] = [
  "accounts",
  "categories",
  "assets",
  "transactions",
  "recurringRules",
  "recurringExceptions",
  "budgets",
  "budgetOverrides",
  "expenseCategoryHierarchy",
  "expenseValidationRules",
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
type PreviewNoticeTone = "danger" | "warning";
type ImportSelectionSource = "selected" | "manual";
type ImportSelectionResolutionMode =
  | "inferred"
  | "manual"
  | "conflict"
  | "unresolved"
  | "parse-error";

type GroupedImportIssue = {
  file: ImportFileType;
  field: string | null;
  message: string;
  rowNumbers: number[];
};

interface ImportSelectionResolution {
  resolvedCategory: ImportFileType | null;
  reason: string | null;
  hint: ImportHeaderHint | null;
  mode: ImportSelectionResolutionMode;
}

interface ImportSelectionEntry {
  id: string;
  file: File | null;
  source: ImportSelectionSource;
  manualCategory: ImportFileType | null;
  resolution: ImportSelectionResolution | null;
}

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

function formatFileNamePreview(fileNames: string[], limit: number = 3): string {
  const preview = fileNames.slice(0, limit);
  const joined = preview.join(", ");

  if (fileNames.length > preview.length) {
    return `${joined} +${fileNames.length - preview.length} more`;
  }

  return joined;
}

function formatImportHint(hint: ImportHeaderHint): string {
  return `Closest match: ${getImportFileLabel(hint.file)} (${hint.matchedHeaders}/${hint.totalHeaders} headers matched)`;
}

export default function ImportsPageClient({
  initialBatches,
  privacySummary,
}: {
  initialBatches: ImportBatchResponse[];
  privacySummary: ImportPrivacySummary;
}) {
  const [importEntries, setImportEntries] = useState<ImportSelectionEntry[]>(
    [],
  );
  const [batches, setBatches] = useState(initialBatches);
  const [preview, setPreview] = useState<ImportPreviewResponse | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewNoticeTone, setPreviewNoticeTone] =
    useState<PreviewNoticeTone>("danger");
  const [applyError, setApplyError] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [isExportingData, setIsExportingData] = useState(false);
  const [isExportingTemplates, setIsExportingTemplates] = useState(false);
  const [isDropZoneActive, setIsDropZoneActive] = useState(false);
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
  const actions = useSingleFlightActions<
    "preview" | "apply" | "exportData" | "exportTemplates"
  >();
  const router = useRouter();
  const disclosureRef = useRef<HTMLDivElement | null>(null);
  const disclosureButtonRefs = useRef<
    Partial<Record<ImportDisclosureId, HTMLButtonElement | null>>
  >({});
  const disclosureCloseTimerRef = useRef<number | null>(null);
  const disclosurePointerIntentRef =
    useRef<ImportDisclosurePointerIntent>(null);
  const mainFileInputRef = useRef<HTMLInputElement | null>(null);
  const dropZoneDepthRef = useRef(0);
  const nextEntryIdRef = useRef(0);

  const fileEntries = useMemo(
    () => importEntries.filter((entry) => entry.file !== null),
    [importEntries],
  );
  const selectedCount = fileEntries.length;
  const skippedEntries = importEntries.filter(
    (entry) => entry.file && entry.resolution?.reason,
  );
  const recoveryEntries = importEntries.filter((entry) => {
    if (entry.source === "manual") {
      return (
        !entry.file || entry.resolution === null || !!entry.resolution.reason
      );
    }

    return Boolean(entry.file && entry.resolution?.reason);
  });
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
      const preferredWidth =
        disclosureId === "privacy"
          ? window.innerWidth <= 640
            ? 360
            : window.innerWidth >= 1200
              ? 900
              : 620
          : disclosureId === "bestUse"
            ? 360
            : 352;

      if (shellRect.width <= 0) {
        setPopoverStyle({
          left: "0px",
          top: `${fallbackTop}px`,
          width: `${preferredWidth}px`,
          "--import-disclosure-arrow-left": "28px",
        });
        return;
      }

      const viewportPadding = 8;
      const width = Math.min(
        preferredWidth,
        Math.max(window.innerWidth - viewportPadding * 2, 0),
      );
      const idealLeft =
        buttonRect.left - shellRect.left + buttonRect.width / 2 - width / 2;
      const minLeft = viewportPadding - shellRect.left;
      const maxLeft =
        window.innerWidth - viewportPadding - shellRect.left - width;
      const clampedLeft = Math.min(
        Math.max(idealLeft, minLeft),
        Math.max(maxLeft, minLeft),
      );
      const buttonCenter =
        buttonRect.left - shellRect.left + buttonRect.width / 2;
      const arrowEdgePadding = disclosureId === "privacy" ? 64 : 28;
      const arrowLeft = Math.min(
        Math.max(buttonCenter - clampedLeft, arrowEdgePadding),
        Math.max(width - arrowEdgePadding, arrowEdgePadding),
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

  function createEntryId(): string {
    const nextId = nextEntryIdRef.current;
    nextEntryIdRef.current += 1;
    return `import-entry-${nextId}`;
  }

  function clearImportFeedback() {
    setPreview(null);
    setPreviewError(null);
    setApplyError(null);
    setPreviewNoticeTone("danger");
  }

  function appendFiles(
    files: File[],
    source: ImportSelectionSource = "selected",
  ) {
    if (files.length === 0) {
      return;
    }

    clearImportFeedback();
    const nextEntries = files.map<ImportSelectionEntry>((file) => ({
      id: createEntryId(),
      file,
      source,
      manualCategory: null,
      resolution: null,
    }));

    setImportEntries((previous) => [...previous, ...nextEntries]);
  }

  function updateImportEntry(
    entryId: string,
    updater: (entry: ImportSelectionEntry) => ImportSelectionEntry,
  ) {
    clearImportFeedback();
    setImportEntries((previous) =>
      previous.map((entry) => (entry.id === entryId ? updater(entry) : entry)),
    );
  }

  function removeImportEntry(entryId: string) {
    clearImportFeedback();
    setImportEntries((previous) =>
      previous.filter((entry) => entry.id !== entryId),
    );
  }

  function addManualEntry() {
    clearImportFeedback();
    setImportEntries((previous) => [
      ...previous,
      {
        id: createEntryId(),
        file: null,
        source: "manual",
        manualCategory: null,
        resolution: null,
      },
    ]);
  }

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

  function handlePrimaryFileSelection(event: ChangeEvent<HTMLInputElement>) {
    appendFiles(Array.from(event.target.files ?? []));
    event.target.value = "";
  }

  function handleEntryFileSelection(
    entryId: string,
    event: ChangeEvent<HTMLInputElement>,
  ) {
    const nextFile = event.target.files?.[0] ?? null;

    updateImportEntry(entryId, (entry) => ({
      ...entry,
      file: nextFile,
      resolution: nextFile ? entry.resolution : null,
    }));
    event.target.value = "";
  }

  function handleEntryCategoryChange(entryId: string, value: string) {
    updateImportEntry(entryId, (entry) => ({
      ...entry,
      manualCategory: value ? (value as ImportFileType) : null,
    }));
  }

  function handleDropZoneDragEnter(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
    dropZoneDepthRef.current += 1;
    setIsDropZoneActive(true);
  }

  function handleDropZoneDragOver(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
    setIsDropZoneActive(true);
  }

  function handleDropZoneDragLeave(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
    dropZoneDepthRef.current = Math.max(0, dropZoneDepthRef.current - 1);

    if (dropZoneDepthRef.current === 0) {
      setIsDropZoneActive(false);
    }
  }

  function handleDropZoneDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
    dropZoneDepthRef.current = 0;
    setIsDropZoneActive(false);
    appendFiles(Array.from(event.dataTransfer.files ?? []));
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
      title: "Preview vs apply",
      panelClassName: "import-disclosure-panel--apply",
      body: (
        <ul className="import-disclosure-list">
          <li>
            Preview is a dry run. Apply commits the reviewed preview into the
            current workspace.
          </li>
          <li>
            Rows are matched by import key so creates, updates, and unchanged
            records stay separated safely.
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
    { id: "apply", label: "Preview vs apply" },
    { id: "bestUse", label: "Best use" },
    { id: "privacy", label: "Import privacy" },
  ];

  async function handlePreview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await actions.run("preview", async () => {
      setPreviewError(null);
      setApplyError(null);
      setExportError(null);
      setPreview(null);

      if (selectedCount === 0) {
        setPreviewNoticeTone("warning");
        setPreviewError("Choose at least one CSV file to preview.");
        return;
      }

      setIsPreviewing(true);

      try {
        const evaluatedEntries = await Promise.all(
          importEntries.map(async (entry) => {
            if (!entry.file) {
              return {
                ...entry,
                resolution: entry.resolution,
              };
            }

            if (entry.manualCategory) {
              return {
                ...entry,
                resolution: {
                  resolvedCategory: entry.manualCategory,
                  reason: null,
                  hint: null,
                  mode: "manual" as const,
                },
              };
            }

            if (entry.source === "manual") {
              return {
                ...entry,
                resolution: {
                  resolvedCategory: null,
                  reason:
                    "Choose a file category to include this CSV in the preview.",
                  hint: null,
                  mode: "manual" as const,
                },
              };
            }

            try {
              const headers = await readImportFileHeaders(entry.file);
              const inference = inferImportFileTypeFromHeaders(headers);

              return {
                ...entry,
                resolution: {
                  resolvedCategory: inference.inferredFile,
                  reason: inference.reason,
                  hint: inference.hint,
                  mode: inference.inferredFile
                    ? ("inferred" as const)
                    : ("unresolved" as const),
                },
              };
            } catch (error) {
              return {
                ...entry,
                resolution: {
                  resolvedCategory: null,
                  reason:
                    error instanceof Error
                      ? error.message
                      : "Could not read CSV headers.",
                  hint: null,
                  mode: "parse-error" as const,
                },
              };
            }
          }),
        );

        const resolvedByCategory = new Map<ImportFileType, string[]>();

        for (const entry of evaluatedEntries) {
          const resolvedCategory = entry.resolution?.resolvedCategory;
          if (!entry.file || !resolvedCategory) {
            continue;
          }

          const current = resolvedByCategory.get(resolvedCategory) ?? [];
          current.push(entry.id);
          resolvedByCategory.set(resolvedCategory, current);
        }

        const conflictingCategories = new Set<ImportFileType>();
        for (const [category, entryIds] of resolvedByCategory.entries()) {
          if (entryIds.length > 1) {
            conflictingCategories.add(category);
          }
        }

        const evaluatedEntriesWithConflicts = evaluatedEntries.map((entry) => {
          const resolvedCategory = entry.resolution?.resolvedCategory;
          if (!entry.file || !resolvedCategory) {
            return entry;
          }

          if (!conflictingCategories.has(resolvedCategory)) {
            return entry;
          }

          return {
            ...entry,
            resolution: {
              resolvedCategory: null,
              reason: `More than one file is currently assigned to ${getImportFileLabel(
                resolvedCategory,
              )}. Keep only one file per category.`,
              hint: null,
              mode: "conflict" as const,
            },
          };
        });

        setImportEntries(evaluatedEntriesWithConflicts);

        const resolvedEntries = evaluatedEntriesWithConflicts.filter(
          (entry) => entry.file && entry.resolution?.resolvedCategory,
        );

        if (resolvedEntries.length === 0) {
          setPreviewNoticeTone("warning");
          setPreviewError(
            "No selected files could be previewed. Assign a category manually or remove the unresolved files first.",
          );
          return;
        }

        const formData = new FormData();
        for (const entry of resolvedEntries) {
          formData.append(
            entry.resolution?.resolvedCategory ?? "",
            entry.file as File,
            (entry.file as File).name,
          );
        }

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
        setPreviewNoticeTone("danger");
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
        if (reloadPage()) {
          return;
        }
        router.refresh();
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

  async function handleExportData() {
    await actions.run("exportData", async () => {
      setExportError(null);
      setIsExportingData(true);

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
        setIsExportingData(false);
      }
    });
  }

  async function handleExportTemplates() {
    await actions.run("exportTemplates", async () => {
      setExportError(null);
      setIsExportingTemplates(true);

      try {
        const response = await fetchApiMutation(
          "/imports/csv/templates/export",
          {
            method: "POST",
          },
        );

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
          "finhance-import-templates.zip";
        document.body.append(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(objectUrl);
      } catch (error) {
        setExportError(
          error instanceof Error
            ? error.message
            : "Unable to export the templates.",
        );
      } finally {
        setIsExportingTemplates(false);
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
        <div className="import-section-header">
          <div className="import-section-copy">
            <h2 className="section-title">Preview inbound files</h2>
            <p className="section-subtitle">
              Drop one or more CSVs here. finhance will infer the category when
              the headers match exactly, then preview only the files that can be
              assigned safely.
            </p>
          </div>

          <div
            ref={disclosureRef}
            className="import-disclosure-shell import-disclosure-shell--header"
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
        </div>

        <form onSubmit={handlePreview} className="section-stack-tight">
          <input
            ref={mainFileInputRef}
            type="file"
            accept=".csv,text/csv"
            multiple
            onChange={handlePrimaryFileSelection}
            aria-label="Import CSV files"
            className="sr-only"
          />

          <div
            className={`import-dropzone${isDropZoneActive ? " is-active" : ""}`}
            onDragEnter={handleDropZoneDragEnter}
            onDragOver={handleDropZoneDragOver}
            onDragLeave={handleDropZoneDragLeave}
            onDrop={handleDropZoneDrop}
          >
            <div className="import-dropzone-copy">
              <p className="import-dropzone-title">
                One landing point for CSV imports
              </p>
              <p className="import-dropzone-text">
                Drag and drop files here, or browse for them manually. Category
                inference runs when you preview.
              </p>
            </div>

            <div className="import-dropzone-actions">
              <button
                type="button"
                onClick={() => mainFileInputRef.current?.click()}
                className="btn-secondary"
              >
                {selectedCount > 0 ? "Add more CSV files" : "Choose CSV files"}
              </button>
              <p className="import-dropzone-status">
                {selectedCount === 0
                  ? "No files selected yet."
                  : `${selectedCount} file${selectedCount === 1 ? "" : "s"} selected.`}
              </p>
            </div>

            {fileEntries.length > 0 ? (
              <ul
                className="import-dropzone-file-list"
                aria-label="Selected import files"
              >
                {fileEntries.map((entry) =>
                  entry.file ? (
                    <li key={entry.id} className="import-dropzone-file-chip">
                      <span className="import-dropzone-file-chip-name">
                        {entry.file.name}
                      </span>
                      <button
                        type="button"
                        onClick={() => removeImportEntry(entry.id)}
                        className="import-dropzone-file-chip-remove"
                        aria-label={`Remove ${entry.file.name} from import`}
                      >
                        x
                      </button>
                    </li>
                  ) : null,
                )}
              </ul>
            ) : null}
          </div>

          {recoveryEntries.length > 0 ? (
            <div className="import-recovery-section">
              <div className="compact-toolbar">
                <div>
                  <h3 className="section-title import-recovery-title">
                    Files that still need manual recovery
                  </h3>
                  <p className="section-subtitle">
                    Resolve conflicts, assign a category manually, or remove the
                    files that should not be previewed.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={addManualEntry}
                  className="btn-secondary"
                >
                  Add file manually
                </button>
              </div>

              <div className="import-recovery-list">
                {recoveryEntries.map((entry) => {
                  const inputId = `import-recovery-file-${entry.id}`;
                  const selectId = `import-recovery-category-${entry.id}`;
                  const hintText = entry.resolution?.hint
                    ? formatImportHint(entry.resolution.hint)
                    : null;

                  return (
                    <article
                      key={entry.id}
                      className="list-card is-muted import-recovery-row"
                    >
                      <div className="import-recovery-row-top">
                        <div className="import-recovery-meta">
                          <p className="import-recovery-file-name">
                            {entry.file?.name ?? "No file selected yet"}
                          </p>
                          {entry.resolution?.reason ? (
                            <p className="import-recovery-reason">
                              {entry.resolution.reason}
                            </p>
                          ) : entry.source === "manual" ? (
                            <p className="import-recovery-reason is-subtle">
                              Choose a CSV and its category, then preview again.
                            </p>
                          ) : null}
                          {hintText ? (
                            <p className="import-recovery-hint">{hintText}</p>
                          ) : null}
                        </div>

                        <div className="import-recovery-actions">
                          <input
                            id={inputId}
                            type="file"
                            accept=".csv,text/csv"
                            onChange={(event) =>
                              handleEntryFileSelection(entry.id, event)
                            }
                            aria-label={
                              entry.file
                                ? `Replace ${entry.file.name}`
                                : "Choose recovery CSV file"
                            }
                            className="sr-only"
                          />
                          <label
                            htmlFor={inputId}
                            className="btn-secondary import-recovery-file-button"
                          >
                            {entry.file ? "Replace file" : "Choose file"}
                          </label>
                          <button
                            type="button"
                            onClick={() => removeImportEntry(entry.id)}
                            className="btn-secondary"
                          >
                            Remove
                          </button>
                        </div>
                      </div>

                      <div className="import-recovery-controls">
                        <div className="app-form-field">
                          <label htmlFor={selectId}>Category</label>
                          <select
                            id={selectId}
                            value={entry.manualCategory ?? ""}
                            onChange={(event) =>
                              handleEntryCategoryChange(
                                entry.id,
                                event.target.value,
                              )
                            }
                          >
                            <option value="">Choose category manually</option>
                            {IMPORT_FILE_ORDER.map((file) => (
                              <option key={file} value={file}>
                                {IMPORT_FILE_LABELS[file]}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            </div>
          ) : null}

          <div className="compact-toolbar">
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
                : `${selectedCount} file${selectedCount === 1 ? "" : "s"} ready for the next preview attempt.`}
            </p>
          </div>

          {previewError ? (
            <p
              role="alert"
              className={`page-inline-notice import-surface-superellipse ${
                previewNoticeTone === "warning"
                  ? "surface-warning"
                  : "surface-danger"
              }`}
            >
              {previewError}
            </p>
          ) : null}
        </form>
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
                {isApplying ? "Applying changes..." : "Apply changes"}
              </button>
            ) : null}
          </div>

          {skippedEntries.length > 0 ? (
            <p className="page-inline-notice surface-warning import-surface-superellipse">
              {skippedEntries.length} selected file
              {skippedEntries.length === 1 ? " was" : "s were"} not included in
              this preview yet:{" "}
              {formatFileNamePreview(
                skippedEntries.flatMap((entry) =>
                  entry.file ? [entry.file.name] : [],
                ),
              )}
              . Resolve them below the main import zone and preview again.
            </p>
          ) : null}

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
            <h2 className="section-title">Templates and round-trip export</h2>
            <p className="section-subtitle">
              Download the shared CSV templates as one ZIP, or export your
              current workspace data package for round-trip restore.
            </p>
          </div>

          <div className="compact-toolbar-actions is-equal">
            <button
              type="button"
              onClick={() => void handleExportTemplates()}
              disabled={isExportingTemplates}
              className="btn-secondary"
            >
              {isExportingTemplates ? "Exporting..." : "Export templates"}
            </button>
            <button
              type="button"
              onClick={() => void handleExportData()}
              disabled={isExportingData}
              className="btn-secondary"
            >
              {isExportingData ? "Exporting..." : "Export data"}
            </button>
          </div>
        </div>

        {exportError ? (
          <p role="alert" className="page-inline-notice surface-danger">
            {exportError}
          </p>
        ) : null}
      </section>

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
