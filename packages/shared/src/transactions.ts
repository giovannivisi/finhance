export type CategoryType = "EXPENSE" | "INCOME";

export interface UpsertCategoryRequest {
  name: string;
  type: CategoryType;
  order?: number | null;
}

export interface CategoryResponse {
  id: string;
  name: string;
  type: CategoryType;
  order: number;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export type TransactionKind = "EXPENSE" | "INCOME" | "TRANSFER" | "ADJUSTMENT";

export type TransactionDirection = "INFLOW" | "OUTFLOW";

interface BaseUpsertTransactionRequest {
  postedAt: string;
  kind: TransactionKind;
  amount: number;
  description: string;
  notes?: string | null;
}

export interface UpsertStandardTransactionRequest
  extends BaseUpsertTransactionRequest {
  kind: "EXPENSE" | "INCOME" | "ADJUSTMENT";
  accountId: string;
  direction: TransactionDirection;
  categoryId?: string | null;
  counterparty?: string | null;
}

export interface UpsertTransferTransactionRequest
  extends BaseUpsertTransactionRequest {
  kind: "TRANSFER";
  sourceAccountId: string;
  destinationAccountId: string;
}

export type UpsertTransactionRequest =
  | UpsertStandardTransactionRequest
  | UpsertTransferTransactionRequest;

export interface TransactionResponse {
  id: string;
  postedAt: string;
  amount: number;
  currency: string;
  kind: TransactionKind;
  accountId: string | null;
  direction: TransactionDirection | null;
  categoryId: string | null;
  description: string;
  notes: string | null;
  counterparty: string | null;
  sourceAccountId: string | null;
  destinationAccountId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CashflowCategoryTotalResponse {
  categoryId: string | null;
  name: string;
  type: CategoryType;
  total: number;
}

export interface CashflowAccountTotalResponse {
  accountId: string;
  name: string;
  inflowTotal: number;
  outflowTotal: number;
  netCashflow: number;
}

export interface CashflowCurrencySummaryResponse {
  currency: string;
  incomeTotal: number;
  expenseTotal: number;
  adjustmentInTotal: number;
  adjustmentOutTotal: number;
  netCashflow: number;
  byCategory: CashflowCategoryTotalResponse[];
  byAccount: CashflowAccountTotalResponse[];
}

export type CashflowSummaryResponse = CashflowCurrencySummaryResponse[];
