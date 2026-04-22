import type { AccountReconciliationResponse } from "./accounts.js";
import type {
  CashflowSummaryResponse,
  TransactionDirection,
  TransactionKind,
} from "./transactions.js";

export interface UpsertRecurringTransactionRuleRequest {
  name: string;
  kind: TransactionKind;
  amount: number;
  dayOfMonth: number;
  startDate: string;
  endDate?: string | null;
  accountId?: string | null;
  direction?: TransactionDirection | null;
  categoryId?: string | null;
  counterparty?: string | null;
  sourceAccountId?: string | null;
  destinationAccountId?: string | null;
  description: string;
  notes?: string | null;
  isActive?: boolean;
}

export interface RecurringTransactionRuleResponse {
  id: string;
  name: string;
  isActive: boolean;
  kind: TransactionKind;
  amount: number;
  dayOfMonth: number;
  startDate: string;
  endDate: string | null;
  accountId: string | null;
  direction: TransactionDirection | null;
  categoryId: string | null;
  counterparty: string | null;
  sourceAccountId: string | null;
  destinationAccountId: string | null;
  description: string;
  notes: string | null;
  lastMaterializationError: string | null;
  lastMaterializationErrorAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MaterializeRecurringRulesResponse {
  createdCount: number;
  processedRuleCount: number;
  failedRuleCount: number;
}

export type RecurringOccurrenceStatus = "SKIPPED" | "OVERRIDDEN";

export interface SkipRecurringOccurrenceRequest {
  status: "SKIPPED";
}

interface BaseOverrideRecurringOccurrenceRequest {
  status: "OVERRIDDEN";
  amount: number;
  postedAtDate: string;
  description: string;
  notes?: string | null;
}

export interface OverrideStandardRecurringOccurrenceRequest
  extends BaseOverrideRecurringOccurrenceRequest {
  accountId: string;
  direction: TransactionDirection;
  categoryId?: string | null;
  counterparty?: string | null;
}

export interface OverrideTransferRecurringOccurrenceRequest
  extends BaseOverrideRecurringOccurrenceRequest {
  sourceAccountId: string;
  destinationAccountId: string;
}

export type UpsertRecurringOccurrenceRequest =
  | SkipRecurringOccurrenceRequest
  | OverrideStandardRecurringOccurrenceRequest
  | OverrideTransferRecurringOccurrenceRequest;

export interface RecurringOccurrenceResponse {
  id: string;
  recurringRuleId: string;
  recurringRuleName: string;
  kind: TransactionKind;
  occurrenceMonth: string;
  status: RecurringOccurrenceStatus;
  amount: number | null;
  postedAtDate: string | null;
  accountId: string | null;
  direction: TransactionDirection | null;
  categoryId: string | null;
  counterparty: string | null;
  sourceAccountId: string | null;
  destinationAccountId: string | null;
  description: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MonthlyReviewResponse {
  month: string;
  cashflow: CashflowSummaryResponse;
  openingNetWorth: number | null;
  closingNetWorth: number | null;
  netWorthDelta: number | null;
  openingSnapshotDate: string | null;
  closingSnapshotDate: string | null;
  reconciliationHighlights: AccountReconciliationResponse[];
  recurringExceptions: RecurringOccurrenceResponse[];
}
