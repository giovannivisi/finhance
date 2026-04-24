import type { AccountReconciliationResponse } from "./accounts.js";
import type {
  MonthlyBudgetCurrencySummaryResponse,
  MonthlyBudgetItemResponse,
} from "./budgets.js";
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

export type MonthlyReviewWarningCode =
  | "MISSING_OPENING_SNAPSHOT"
  | "MISSING_CLOSING_SNAPSHOT"
  | "PARTIAL_OPENING_SNAPSHOT"
  | "PARTIAL_CLOSING_SNAPSHOT"
  | "NON_EUR_CASHFLOW_NOT_COMPARABLE"
  | "UNCATEGORIZED_EXPENSES"
  | "UNCATEGORIZED_INCOME"
  | "OVER_BUDGET_CATEGORIES"
  | "RECONCILIATION_ISSUES"
  | "RECURRING_EXCEPTIONS_PRESENT"
  | "UNBUDGETED_EXPENSES";

export type MonthlyReviewWarningSeverity = "INFO" | "WARNING";

export interface MonthlyReviewWarningResponse {
  code: MonthlyReviewWarningCode;
  severity: MonthlyReviewWarningSeverity;
  title: string;
  detail: string;
  count: number | null;
  amount: number | null;
  currency: string | null;
}

export interface MonthlyReviewNetWorthExplanationResponse {
  isComparableInEur: boolean;
  cashflowContributionEur: number | null;
  valuationMovementEur: number | null;
  note: string | null;
}

export interface MonthlyReviewRecurringComparisonResponse {
  currency: string;
  expectedIncomeTotal: number;
  actualIncomeTotal: number;
  expectedExpenseTotal: number;
  actualExpenseTotal: number;
  dueRuleCount: number;
  realizedRuleCount: number;
  skippedCount: number;
  overriddenCount: number;
  transferRulesExcludedCount: number;
}

export interface MonthlyReviewCategoryDriverResponse {
  categoryId: string | null;
  name: string;
  total: number;
}

export interface MonthlyReviewAccountDriverResponse {
  accountId: string;
  name: string;
  inflowTotal: number;
  outflowTotal: number;
  netCashflow: number;
}

export interface MonthlyReviewCurrencyInsightResponse {
  currency: string;
  savingsRate: number | null;
  uncategorizedExpenseTotal: number;
  uncategorizedIncomeTotal: number;
  topExpenseCategories: MonthlyReviewCategoryDriverResponse[];
  topIncomeCategories: MonthlyReviewCategoryDriverResponse[];
  topAccounts: MonthlyReviewAccountDriverResponse[];
}

export interface MonthlyReviewResponse {
  month: string;
  cashflow: CashflowSummaryResponse;
  openingNetWorth: number | null;
  closingNetWorth: number | null;
  netWorthDelta: number | null;
  openingSnapshotDate: string | null;
  closingSnapshotDate: string | null;
  warnings: MonthlyReviewWarningResponse[];
  netWorthExplanation: MonthlyReviewNetWorthExplanationResponse;
  recurringComparison: MonthlyReviewRecurringComparisonResponse[];
  currencyInsights: MonthlyReviewCurrencyInsightResponse[];
  budgetSummary: MonthlyBudgetCurrencySummaryResponse[];
  budgetHighlights: MonthlyBudgetItemResponse[];
  reconciliationHighlights: AccountReconciliationResponse[];
  recurringExceptions: RecurringOccurrenceResponse[];
}
