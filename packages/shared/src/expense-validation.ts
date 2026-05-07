export interface UpsertExpenseValidationRuleRequest {
  entry: string;
  secondaryCategoryId: string;
}

export interface ExpenseValidationRuleResponse {
  id: string;
  entry: string;
  normalizedEntry: string;
  secondaryCategoryId: string;
  secondaryCategoryName: string;
  primaryCategoryId: string;
  primaryCategoryName: string;
  createdAt: string;
  updatedAt: string;
}
