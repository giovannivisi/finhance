import assert from "node:assert/strict";
import test from "node:test";
import type { ExpenseValidationRuleResponse } from "@finhance/shared";
import { groupExpenseValidationRules } from "./expense-validation.ts";

function buildRule(
  overrides: Partial<ExpenseValidationRuleResponse>,
): ExpenseValidationRuleResponse {
  return {
    id: overrides.id ?? "rule-1",
    entry: overrides.entry ?? "Coffee",
    normalizedEntry: overrides.normalizedEntry ?? "coffee",
    secondaryCategoryId: overrides.secondaryCategoryId ?? "secondary-1",
    secondaryCategoryName:
      overrides.secondaryCategoryName ?? "Coffee shops",
    primaryCategoryId: overrides.primaryCategoryId ?? "primary-1",
    primaryCategoryName: overrides.primaryCategoryName ?? "Food",
    createdAt: overrides.createdAt ?? "2026-05-14T10:00:00.000Z",
    updatedAt: overrides.updatedAt ?? "2026-05-14T10:00:00.000Z",
  };
}

test("groupExpenseValidationRules groups by primary category alphabetically", () => {
  const groups = groupExpenseValidationRules([
    buildRule({
      id: "2",
      entry: "Gym",
      primaryCategoryName: "Health",
    }),
    buildRule({
      id: "1",
      entry: "Coffee",
      primaryCategoryName: "Food",
    }),
  ]);

  assert.deepEqual(
    groups.map((group) => group.primaryCategoryName),
    ["Food", "Health"],
  );
});

test("groupExpenseValidationRules sorts rules by entry with secondary tiebreakers", () => {
  const groups = groupExpenseValidationRules([
    buildRule({
      id: "3",
      entry: "apple store",
      secondaryCategoryName: "Devices",
      primaryCategoryName: "Shopping",
    }),
    buildRule({
      id: "2",
      entry: "Apple Store",
      secondaryCategoryName: "Accessories",
      primaryCategoryName: "Shopping",
    }),
    buildRule({
      id: "1",
      entry: "Bakery",
      secondaryCategoryName: "Bread",
      primaryCategoryName: "Shopping",
    }),
  ]);

  assert.equal(groups.length, 1);
  assert.deepEqual(
    groups[0]?.rules.map((rule) => rule.id),
    ["2", "3", "1"],
  );
});
