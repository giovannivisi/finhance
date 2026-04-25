export type ImportSource = "CSV_TEMPLATE";

export type ImportBatchStatus = "PREVIEW" | "APPLIED" | "FAILED";

export type ImportFileType =
  | "accounts"
  | "categories"
  | "assets"
  | "transactions"
  | "recurringRules"
  | "recurringExceptions"
  | "budgets"
  | "budgetOverrides";

export type ImportIssueSeverity = "ERROR" | "WARNING";

export interface ImportRowIssueResponse {
  file: ImportFileType;
  rowNumber: number;
  field: string | null;
  severity: ImportIssueSeverity;
  message: string;
}

export interface ImportFileSummaryResponse {
  file: ImportFileType;
  createCount: number;
  updateCount: number;
  unchangedCount: number;
}

export interface ImportBatchSummaryResponse {
  files: ImportFileSummaryResponse[];
  errorCount: number;
  warningCount: number;
}

export interface ImportBatchResponse {
  id: string;
  source: ImportSource;
  status: ImportBatchStatus;
  summary: ImportBatchSummaryResponse;
  issues: ImportRowIssueResponse[];
  createdAt: string;
  appliedAt: string | null;
}

export interface ImportPreviewResponse extends ImportBatchResponse {
  canApply: boolean;
}

export const ACCOUNT_IMPORT_HEADERS = [
  "importKey",
  "name",
  "type",
  "currency",
  "institution",
  "notes",
  "order",
  "openingBalance",
  "openingBalanceDate",
  "archived",
] as const;

export const CATEGORY_IMPORT_HEADERS = [
  "importKey",
  "name",
  "type",
  "order",
  "archived",
] as const;

export const ASSET_IMPORT_HEADERS = [
  "importKey",
  "name",
  "type",
  "kind",
  "liabilityKind",
  "currency",
  "balance",
  "accountImportKey",
  "ticker",
  "exchange",
  "quantity",
  "unitPrice",
  "notes",
  "order",
] as const;

export const TRANSACTION_IMPORT_HEADERS = [
  "importKey",
  "postedAt",
  "kind",
  "amount",
  "description",
  "notes",
  "accountImportKey",
  "direction",
  "categoryImportKey",
  "counterparty",
  "sourceAccountImportKey",
  "destinationAccountImportKey",
] as const;

export const RECURRING_RULE_IMPORT_HEADERS = [
  "importKey",
  "name",
  "isActive",
  "kind",
  "amount",
  "dayOfMonth",
  "startDate",
  "endDate",
  "accountImportKey",
  "direction",
  "categoryImportKey",
  "counterparty",
  "sourceAccountImportKey",
  "destinationAccountImportKey",
  "description",
  "notes",
] as const;

export const RECURRING_EXCEPTION_IMPORT_HEADERS = [
  "recurringRuleImportKey",
  "month",
  "status",
  "amount",
  "postedAtDate",
  "accountImportKey",
  "direction",
  "categoryImportKey",
  "counterparty",
  "sourceAccountImportKey",
  "destinationAccountImportKey",
  "description",
  "notes",
] as const;

export const BUDGET_IMPORT_HEADERS = [
  "importKey",
  "categoryImportKey",
  "currency",
  "amount",
  "startMonth",
  "endMonth",
] as const;

export const BUDGET_OVERRIDE_IMPORT_HEADERS = [
  "budgetImportKey",
  "month",
  "amount",
  "note",
] as const;

export const IMPORT_TEMPLATE_HEADERS: Record<
  ImportFileType,
  readonly string[]
> = {
  accounts: ACCOUNT_IMPORT_HEADERS,
  categories: CATEGORY_IMPORT_HEADERS,
  assets: ASSET_IMPORT_HEADERS,
  transactions: TRANSACTION_IMPORT_HEADERS,
  recurringRules: RECURRING_RULE_IMPORT_HEADERS,
  recurringExceptions: RECURRING_EXCEPTION_IMPORT_HEADERS,
  budgets: BUDGET_IMPORT_HEADERS,
  budgetOverrides: BUDGET_OVERRIDE_IMPORT_HEADERS,
};
