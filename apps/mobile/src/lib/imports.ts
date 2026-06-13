import type {
  ImportBatchResponse,
  ImportBatchStatus,
  ImportBatchSummaryResponse,
  ImportFileSummaryResponse,
  ImportFileType,
} from "@finhance/shared";

export interface ImportSummaryGroup {
  id: "foundation" | "activity" | "planning";
  title: string;
  detail: string;
  files: ImportFileSummaryResponse[];
}

const GROUP_CONFIG = [
  {
    id: "foundation",
    title: "Foundation",
    detail: "Accounts, categories, hierarchy, and validation rules.",
    fileOrder: [
      "accounts",
      "categories",
      "expenseCategoryHierarchy",
      "expenseValidationRules",
    ] as const,
  },
  {
    id: "activity",
    title: "Activity",
    detail: "Assets, transactions, and recurring definitions.",
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
    detail: "Budgets and monthly overrides.",
    fileOrder: ["budgets", "budgetOverrides"] as const,
  },
] as const;

export const IMPORT_FILE_LABELS: Record<ImportFileType, string> = {
  accounts: "Accounts",
  categories: "Categories",
  assets: "Assets",
  transactions: "Transactions",
  recurringRules: "Recurring rules",
  recurringExceptions: "Recurring exceptions",
  budgets: "Budgets",
  budgetOverrides: "Budget overrides",
  expenseCategoryHierarchy: "Expense hierarchy",
  expenseValidationRules: "Expense validation",
};

export function getImportFileLabel(file: ImportFileType): string {
  return IMPORT_FILE_LABELS[file];
}

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

export function totalImportRows(summary: ImportBatchSummaryResponse): number {
  return summary.files.reduce(
    (total, file) =>
      total + file.createCount + file.updateCount + file.unchangedCount,
    0,
  );
}

export function importStatusTone(
  status: ImportBatchStatus,
  summary: ImportBatchSummaryResponse,
): "success" | "danger" | "warning" | "neutral" {
  if (status === "APPLIED") {
    return "success";
  }

  if (status === "FAILED" || summary.errorCount > 0) {
    return "danger";
  }

  if (summary.warningCount > 0) {
    return "warning";
  }

  return "neutral";
}

export function sortImportBatches(
  batches: ImportBatchResponse[],
): ImportBatchResponse[] {
  return [...batches].sort(
    (left, right) =>
      new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime(),
  );
}
