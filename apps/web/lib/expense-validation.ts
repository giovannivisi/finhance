import type { ExpenseValidationRuleResponse } from "@finhance/shared";

export interface GroupedExpenseValidationRules {
  primaryCategoryName: string;
  rules: ExpenseValidationRuleResponse[];
}

function compareText(left: string, right: string): number {
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
    .sort(([left], [right]) => compareText(left, right))
    .map(([primaryCategoryName, groupedRules]) => ({
      primaryCategoryName,
      rules: [...groupedRules].sort((left, right) => {
        const byEntry = compareText(left.entry, right.entry);
        if (byEntry !== 0) {
          return byEntry;
        }

        return compareText(
          left.secondaryCategoryName,
          right.secondaryCategoryName,
        );
      }),
    }));
}
