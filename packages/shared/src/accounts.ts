export type AccountType =
  | "BANK"
  | "BROKER"
  | "CARD"
  | "CASH"
  | "LOAN"
  | "OTHER";

export interface UpsertAccountRequest {
  name: string;
  type: AccountType;
  currency?: string;
  institution?: string | null;
  notes?: string | null;
  order?: number | null;
  openingBalance?: number | null;
  openingBalanceDate?: string | null;
}

export interface AccountResponse {
  id: string;
  name: string;
  type: AccountType;
  currency: string;
  institution: string | null;
  notes: string | null;
  order: number;
  openingBalance: number;
  openingBalanceDate: string | null;
  archivedAt: string | null;
  canDeletePermanently: boolean;
  deleteBlockReason: string | null;
  createdAt: string;
  updatedAt: string;
}

export type AccountReconciliationStatus = "CLEAN" | "MISMATCH" | "UNSUPPORTED";

export type AccountReconciliationBaselineMode =
  | "FULL_HISTORY"
  | "OPENING_BALANCE";

export type AccountReconciliationIssueCode =
  | "FX_UNAVAILABLE"
  | "TRANSFER_GROUP_INCOMPLETE";

export type AccountReconciliationDiagnosticCode =
  | AccountReconciliationIssueCode
  | "BASELINE_MISSING"
  | "BASELINE_POSSIBLY_STALE";

export type AccountReconciliationDiagnosticSeverity = "INFO" | "WARNING";

export interface AccountReconciliationDiagnosticResponse {
  code: AccountReconciliationDiagnosticCode;
  severity: AccountReconciliationDiagnosticSeverity;
  summary: string;
  likelyCause: string;
  recommendedAction: string;
}

export type AccountReconciliationAdjustmentGuidanceStatus =
  | "SAFE"
  | "SUSPICIOUS"
  | "BLOCKED";

export interface AccountReconciliationAdjustmentGuidanceResponse {
  status: AccountReconciliationAdjustmentGuidanceStatus;
  message: string;
}

export interface AccountReconciliationResponse {
  status: AccountReconciliationStatus;
  accountId: string;
  accountName: string;
  accountType: AccountType;
  currency: string;
  baselineMode: AccountReconciliationBaselineMode;
  trackedBalance: number | null;
  expectedBalance: number | null;
  delta: number | null;
  assetCount: number;
  transactionCount: number;
  issueCodes: AccountReconciliationIssueCode[];
  diagnostics: AccountReconciliationDiagnosticResponse[];
  canCreateAdjustment: boolean;
  canEstablishOpeningBalanceBaseline: boolean;
  openingBalanceBaselineGuidance: string | null;
  adjustmentGuidance: AccountReconciliationAdjustmentGuidanceResponse;
}
