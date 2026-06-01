import type {
  ImportBatchSummaryResponse,
  ImportFileSummaryResponse,
  ImportPreviewResponse,
  ImportRowIssueResponse,
} from "@finhance/shared";

export interface ImportSummaryGroup {
  id: "foundation" | "activity" | "planning";
  title: string;
  detail: string;
  files: ImportFileSummaryResponse[];
}

export interface ImportReadiness {
  tone: "ready" | "warning" | "blocked";
  title: string;
  detail: string;
}

const GROUP_CONFIG = [
  {
    id: "foundation",
    title: "Foundation",
    detail:
      "Accounts and categories establish the baseline the rest of the import relies on.",
    fileOrder: ["accounts", "categories"] as const,
  },
  {
    id: "activity",
    title: "Activity",
    detail:
      "Assets, manual transactions, and recurring definitions shape balances and future materialized rows.",
    fileOrder: [
      "assets",
      "transactions",
      "recurringRules",
      "recurringExceptions",
    ] as const,
  },
  {
    id: "planning",
    title: "Planning",
    detail:
      "Budgets and overrides carry the monthly planning layer across environments.",
    fileOrder: ["budgets", "budgetOverrides"] as const,
  },
] as const;

export function groupImportSummaries(
  summary: ImportBatchSummaryResponse,
): ImportSummaryGroup[] {
  return GROUP_CONFIG.map((group) => ({
    id: group.id,
    title: group.title,
    detail: group.detail,
    files: group.fileOrder
      .map((file) => summary.files.find((entry) => entry.file === file) ?? null)
      .filter((entry): entry is ImportFileSummaryResponse => entry !== null),
  })).filter((group) => group.files.length > 0);
}

export function getImportReadiness(
  preview: Pick<ImportPreviewResponse, "canApply" | "summary">,
): ImportReadiness {
  if (!preview.canApply || preview.summary.errorCount > 0) {
    return {
      tone: "blocked",
      title: "Blocked by import errors",
      detail: `${preview.summary.errorCount} error${
        preview.summary.errorCount === 1 ? "" : "s"
      } must be fixed before apply is allowed.`,
    };
  }

  if (preview.summary.warningCount > 0) {
    return {
      tone: "warning",
      title: "Ready to apply, but warnings need review",
      detail: `${preview.summary.warningCount} warning${
        preview.summary.warningCount === 1 ? "" : "s"
      } will not block apply, but they may weaken trust in the result.`,
    };
  }

  return {
    tone: "ready",
    title: "Ready to apply",
    detail:
      "No validation blockers or warnings were found in this preview. Applying will merge the selected files into the current workspace.",
  };
}

export function splitImportIssues(issues: ImportRowIssueResponse[]): {
  errors: ImportRowIssueResponse[];
  warnings: ImportRowIssueResponse[];
} {
  return {
    errors: issues.filter((issue) => issue.severity === "ERROR"),
    warnings: issues.filter((issue) => issue.severity === "WARNING"),
  };
}
