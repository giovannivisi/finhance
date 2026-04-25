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
  canDeletePermanently: boolean;
  deleteBlockReason: string | null;
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
  recurringRuleId: string | null;
  recurringOccurrenceMonth: string | null;
  isRecurringGenerated: boolean;
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

export interface MonthlyCashflowCategoryTotalResponse {
  categoryId: string | null;
  name: string;
  total: number;
}

export interface CashflowAnalyticsMonthPointResponse {
  month: string;
  incomeTotal: number;
  expenseTotal: number;
  netCashflow: number;
  adjustmentInTotal: number;
  adjustmentOutTotal: number;
  uncategorizedExpenseTotal: number;
  uncategorizedIncomeTotal: number;
}

export interface CashflowAnalyticsBreakdownItemResponse {
  categoryId: string | null;
  name: string;
  total: number;
}

export interface CashflowAnalyticsCategoryTrendPointResponse {
  month: string;
  total: number;
}

export interface CashflowAnalyticsCategoryTrendResponse {
  categoryId: string | null;
  name: string;
  total: number;
  series: CashflowAnalyticsCategoryTrendPointResponse[];
}

export interface CashflowAnalyticsMonthOverMonthChangeResponse {
  categoryId: string | null;
  name: string;
  previousTotal: number;
  currentTotal: number;
  delta: number;
}

export interface CashflowAnalyticsCurrencyResponse {
  currency: string;
  averageMonthlyExpense: number;
  averageMonthlyIncome: number;
  monthlySeries: CashflowAnalyticsMonthPointResponse[];
  focusMonthExpenseBreakdown: CashflowAnalyticsBreakdownItemResponse[];
  focusMonthIncomeBreakdown: CashflowAnalyticsBreakdownItemResponse[];
  expenseCategoryTrends: CashflowAnalyticsCategoryTrendResponse[];
  incomeCategoryTrends: CashflowAnalyticsCategoryTrendResponse[];
  expenseMonthOverMonthChanges: CashflowAnalyticsMonthOverMonthChangeResponse[];
  incomeMonthOverMonthChanges: CashflowAnalyticsMonthOverMonthChangeResponse[];
}

export interface CashflowAnalyticsResponse {
  from: string;
  to: string;
  focusMonth: string;
  currencies: CashflowAnalyticsCurrencyResponse[];
}

export interface MonthlyCashflowMonthResponse {
  month: string;
  incomeTotal: number;
  expenseTotal: number;
  netCashflow: number;
  adjustmentInTotal: number;
  adjustmentOutTotal: number;
  transferTotalExcluded: number;
  uncategorizedExpenseTotal: number;
  uncategorizedIncomeTotal: number;
  savingsRate: number | null;
  expenseCategories: MonthlyCashflowCategoryTotalResponse[];
  incomeCategories: MonthlyCashflowCategoryTotalResponse[];
}

export interface MonthlyCashflowCurrencyResponse {
  currency: string;
  averageMonthlyExpense: number;
  rangeExpenseCategories: MonthlyCashflowCategoryTotalResponse[];
  months: MonthlyCashflowMonthResponse[];
}

export type MonthlyCashflowResponse = MonthlyCashflowCurrencyResponse[];
