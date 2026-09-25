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

export interface GroupedExpenseValidationRules {
  primaryCategoryName: string;
  rules: ExpenseValidationRuleResponse[];
}

function compareExpenseValidationText(left: string, right: string): number {
  return left.localeCompare(right, undefined, {
    sensitivity: "base",
  });
}

export function groupExpenseValidationRules(
  rules: ExpenseValidationRuleResponse[],
): GroupedExpenseValidationRules[] {
  const groups = new Map<string, ExpenseValidationRuleResponse[]>();

  for (const rule of rules) {
    const group = groups.get(rule.primaryCategoryName) ?? [];
    group.push(rule);
    groups.set(rule.primaryCategoryName, group);
  }

  return Array.from(groups.entries())
    .sort(([left], [right]) => compareExpenseValidationText(left, right))
    .map(([primaryCategoryName, groupedRules]) => ({
      primaryCategoryName,
      rules: [...groupedRules].sort((left, right) => {
        const byEntry = compareExpenseValidationText(left.entry, right.entry);
        if (byEntry !== 0) {
          return byEntry;
        }

        return compareExpenseValidationText(
          left.secondaryCategoryName,
          right.secondaryCategoryName,
        );
      }),
    }));
}
