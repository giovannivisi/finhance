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
  createdAt: string;
  updatedAt: string;
}

export type AccountReconciliationStatus = "CLEAN" | "MISMATCH" | "UNSUPPORTED";

export type AccountReconciliationIssueCode =
  | "FX_UNAVAILABLE"
  | "TRANSFER_GROUP_INCOMPLETE";

export interface AccountReconciliationResponse {
  status: AccountReconciliationStatus;
  accountId: string;
  accountName: string;
  accountType: AccountType;
  currency: string;
  trackedBalance: number | null;
  expectedBalance: number | null;
  delta: number | null;
  assetCount: number;
  transactionCount: number;
  issueCodes: AccountReconciliationIssueCode[];
  canCreateAdjustment: boolean;
}
