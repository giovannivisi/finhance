export type BudgetUsageStatus = "WITHIN_BUDGET" | "AT_LIMIT" | "OVER_BUDGET";

export interface CreateCategoryBudgetRequest {
  categoryId: string;
  currency: string;
  amount: number;
  startMonth: string;
  endMonth?: string | null;
}

export interface UpdateCategoryBudgetRequest {
  amount: number;
  effectiveMonth: string;
  endMonth?: string | null;
}

export interface UpsertCategoryBudgetOverrideRequest {
  amount: number;
  note?: string | null;
}

export interface CategoryBudgetResponse {
  id: string;
  categoryId: string;
  categoryName: string;
  categoryArchivedAt: string | null;
  currency: string;
  amount: number;
  startMonth: string;
  endMonth: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CategoryBudgetOverrideResponse {
  id: string;
  categoryBudgetId: string;
  month: string;
  amount: number;
  note: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MonthlyBudgetItemResponse {
  budgetId: string;
  categoryId: string;
  categoryName: string;
  categoryArchivedAt: string | null;
  currency: string;
  budgetAmount: number;
  spentAmount: number;
  remainingAmount: number;
  usageRatio: number | null;
  status: BudgetUsageStatus;
  previousMonthExpense: number | null;
  averageExpenseLast3Months: number | null;
  startMonth: string;
  endMonth: string | null;
  override: CategoryBudgetOverrideResponse | null;
}

export interface MonthlyBudgetUnbudgetedCategoryResponse {
  categoryId: string;
  categoryName: string;
  categoryArchivedAt: string | null;
  currency: string;
  spentAmount: number;
  previousMonthExpense: number | null;
  averageExpenseLast3Months: number | null;
}

export interface MonthlyBudgetCurrencySummaryResponse {
  currency: string;
  budgetTotal: number;
  spentTotal: number;
  remainingTotal: number;
  overBudgetTotal: number;
  overBudgetCount: number;
  budgetedCategoryCount: number;
  unbudgetedExpenseTotal: number;
  uncategorizedExpenseTotal: number;
  items: MonthlyBudgetItemResponse[];
  overBudgetHighlights: MonthlyBudgetItemResponse[];
  unbudgetedCategories: MonthlyBudgetUnbudgetedCategoryResponse[];
}

export interface MonthlyBudgetResponse {
  month: string;
  includeArchivedCategories: boolean;
  currencies: MonthlyBudgetCurrencySummaryResponse[];
}
