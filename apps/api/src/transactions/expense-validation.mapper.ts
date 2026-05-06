import type { ExpenseValidationRuleResponse } from '@finhance/shared';
import type { ExpenseValidationRuleRecord } from '@transactions/expense-validation.service';

export function toExpenseValidationRuleResponse(
  rule: ExpenseValidationRuleRecord,
): ExpenseValidationRuleResponse {
  return {
    id: rule.id,
    entry: rule.entry,
    normalizedEntry: rule.normalizedEntry,
    secondaryCategoryId: rule.secondaryCategoryId,
    secondaryCategoryName: rule.secondaryCategory.name,
    primaryCategoryId: rule.secondaryCategory.parentCategory!.id,
    primaryCategoryName: rule.secondaryCategory.parentCategory!.name,
    createdAt: rule.createdAt.toISOString(),
    updatedAt: rule.updatedAt.toISOString(),
  };
}
