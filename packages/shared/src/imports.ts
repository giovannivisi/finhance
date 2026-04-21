export type ImportSource = "CSV_TEMPLATE";

export type ImportBatchStatus = "PREVIEW" | "APPLIED" | "FAILED";

export type ImportFileType =
  | "accounts"
  | "categories"
  | "assets"
  | "transactions";

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

export const IMPORT_TEMPLATE_HEADERS: Record<
  ImportFileType,
  readonly string[]
> = {
  accounts: ACCOUNT_IMPORT_HEADERS,
  categories: CATEGORY_IMPORT_HEADERS,
  assets: ASSET_IMPORT_HEADERS,
  transactions: TRANSACTION_IMPORT_HEADERS,
};
