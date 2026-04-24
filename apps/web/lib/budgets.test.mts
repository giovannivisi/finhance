import assert from "node:assert/strict";
import test from "node:test";
import {
  buildBudgetTransactionsLink,
  buildBudgetsQueryString,
  getBudgetFilters,
  getCurrentRomeMonth,
} from "./budgets.ts";

test("getCurrentRomeMonth uses Europe/Rome month boundaries", () => {
  assert.equal(
    getCurrentRomeMonth(new Date("2026-04-30T21:59:59.000Z")),
    "2026-04",
  );
  assert.equal(
    getCurrentRomeMonth(new Date("2026-04-30T22:00:00.000Z")),
    "2026-05",
  );
});

test("getBudgetFilters falls back to the current month and parses archived flag", () => {
  assert.deepEqual(
    getBudgetFilters(
      {
        month: "bad",
        includeArchivedCategories: "true",
      },
      new Date("2026-04-10T12:00:00.000Z"),
    ),
    {
      month: "2026-04",
      includeArchivedCategories: true,
    },
  );
});

test("buildBudgetsQueryString includes month and only truthy archived flag", () => {
  assert.equal(
    buildBudgetsQueryString({
      month: "2026-04",
      includeArchivedCategories: false,
    }),
    "month=2026-04",
  );
  assert.equal(
    buildBudgetsQueryString({
      month: "2026-04",
      includeArchivedCategories: true,
    }),
    "month=2026-04&includeArchivedCategories=true",
  );
});

test("buildBudgetTransactionsLink narrows to expense rows for the month and category", () => {
  assert.equal(
    buildBudgetTransactionsLink({
      month: "2026-04",
      categoryId: "category-1",
    }),
    "/transactions?from=2026-04-01&to=2026-04-30&categoryId=category-1&kind=EXPENSE",
  );
});
