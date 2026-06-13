import { describe, expect, it } from "vitest";
import type { ExpenseValidationRuleResponse } from "@finhance/shared";

import { groupExpenseValidationRules } from "./expense-validation";

function rule(
  overrides: Partial<ExpenseValidationRuleResponse> = {},
): ExpenseValidationRuleResponse {
  return {
    id: "rule",
    entry: "entry",
    normalizedEntry: "entry",
    secondaryCategoryId: "secondary",
    secondaryCategoryName: "Secondary",
    primaryCategoryId: "primary",
    primaryCategoryName: "Primary",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("groupExpenseValidationRules", () => {
  it("groups rules by primary category and sorts entries inside each group", () => {
    const groups = groupExpenseValidationRules([
      rule({
        id: "taxi",
        entry: "Taxi",
        secondaryCategoryName: "Transport",
        primaryCategoryName: "Travel",
      }),
      rule({
        id: "market",
        entry: "Market",
        secondaryCategoryName: "Groceries",
        primaryCategoryName: "Household",
      }),
      rule({
        id: "airbnb",
        entry: "Airbnb",
        secondaryCategoryName: "Lodging",
        primaryCategoryName: "Travel",
      }),
    ]);

    expect(groups.map((group) => group.primaryCategoryName)).toEqual([
      "Household",
      "Travel",
    ]);
    expect(groups[1]?.rules.map((entry) => entry.entry)).toEqual([
      "Airbnb",
      "Taxi",
    ]);
  });
});
