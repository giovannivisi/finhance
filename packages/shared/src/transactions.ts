export type CategoryType = "EXPENSE" | "INCOME";

export interface UpsertCategoryRequest {
  name: string;
  type: CategoryType;
  parentCategoryId?: string | null;
  order?: number | null;
}

export interface CategoryResponse {
  id: string;
  name: string;
  type: CategoryType;
  parentCategoryId: string | null;
  parentCategoryName: string | null;
  isPrimary: boolean;
  isSecondary: boolean;
  order: number;
  archivedAt: string | null;
  canDeletePermanently: boolean;
  deleteBlockReason: string | null;
  createdAt: string;
  updatedAt: string;
}

export type TransactionKind = "EXPENSE" | "INCOME" | "TRANSFER" | "ADJUSTMENT";

export type TransactionDirection = "INFLOW" | "OUTFLOW";
export type FxRateSource = "LIVE" | "MANUAL";

interface BaseUpsertTransactionRequest {
  postedAt: string;
  kind: TransactionKind;
  amount: number;
  description: string;
  notes?: string | null;
}

export interface SplitTransactionFundingLegRequest {
  accountId: string;
  amount: number;
}

export interface UpsertStandardTransactionRequest
  extends BaseUpsertTransactionRequest {
  kind: "EXPENSE" | "INCOME" | "ADJUSTMENT";
  accountId: string;
  direction: TransactionDirection;
  categoryId?: string | null;
  counterparty?: string | null;
  nativeAmount?: number | null;
  nativeCurrency?: string | null;
  fxRateUsed?: number | null;
  fxRateSource?: FxRateSource | null;
}

export interface UpsertSplitExpenseTransactionRequest
  extends BaseUpsertTransactionRequest {
  kind: "EXPENSE";
  categoryId: string;
  counterparty?: string | null;
  fundingLegs: SplitTransactionFundingLegRequest[];
}

export interface UpsertTransferTransactionRequest
  extends BaseUpsertTransactionRequest {
  kind: "TRANSFER";
  sourceAccountId: string;
  destinationAccountId: string;
  sourceAmount?: number | null;
  destinationAmount?: number | null;
  sourceCurrency?: string | null;
  destinationCurrency?: string | null;
  fxRateUsed?: number | null;
  fxRateSource?: FxRateSource | null;
}

export type UpsertTransactionRequest =
  | UpsertSplitExpenseTransactionRequest
  | UpsertStandardTransactionRequest
  | UpsertTransferTransactionRequest;

export interface TransactionFundingLegResponse {
  accountId: string;
  amount: number;
  currency: string;
}

export interface TransactionResponse {
  id: string;
  postedAt: string;
  amount: number;
  currency: string;
  kind: TransactionKind;
  accountId: string | null;
  direction: TransactionDirection | null;
  categoryId: string | null;
  primaryCategoryId: string | null;
  primaryCategoryName: string | null;
  secondaryCategoryId: string | null;
  secondaryCategoryName: string | null;
  description: string;
  notes: string | null;
  counterparty: string | null;
  sourceAccountId: string | null;
  destinationAccountId: string | null;
  nativeAmount?: number | null;
  nativeCurrency?: string | null;
  fxRateUsed?: number | null;
  fxRateSource?: FxRateSource | null;
  sourceAmount?: number | null;
  destinationAmount?: number | null;
  sourceCurrency?: string | null;
  destinationCurrency?: string | null;
  splitGroupId?: string | null;
  fundingLegs?: TransactionFundingLegResponse[] | null;
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
  primaryCategoryId: string | null;
  primaryCategoryName: string | null;
  secondaryCategoryId: string | null;
  secondaryCategoryName: string | null;
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
  primaryCategoryId: string | null;
  primaryCategoryName: string | null;
  secondaryCategoryId: string | null;
  secondaryCategoryName: string | null;
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
  primaryCategoryId: string | null;
  primaryCategoryName: string | null;
  secondaryCategoryId: string | null;
  secondaryCategoryName: string | null;
  total: number;
}

export interface CashflowAnalyticsCategoryTrendPointResponse {
  month: string;
  total: number;
}

export interface CashflowAnalyticsCategoryTrendResponse {
  categoryId: string | null;
  name: string;
  primaryCategoryId: string | null;
  primaryCategoryName: string | null;
  secondaryCategoryId: string | null;
  secondaryCategoryName: string | null;
  total: number;
  series: CashflowAnalyticsCategoryTrendPointResponse[];
}

export interface CashflowAnalyticsMonthOverMonthChangeResponse {
  categoryId: string | null;
  name: string;
  primaryCategoryId: string | null;
  primaryCategoryName: string | null;
  secondaryCategoryId: string | null;
  secondaryCategoryName: string | null;
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

export interface CashflowAnalyticsReportingOverviewResponse {
  reportingCurrency: string;
  averageMonthlyExpense: number;
  averageMonthlyIncome: number;
  focusMonthIncomeTotal: number;
  focusMonthExpenseTotal: number;
  focusMonthNetCashflow: number;
  monthlySeries: CashflowAnalyticsMonthPointResponse[];
}

export interface CashflowAnalyticsResponse {
  from: string;
  to: string;
  focusMonth: string;
  reportingOverview?: CashflowAnalyticsReportingOverviewResponse | null;
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
