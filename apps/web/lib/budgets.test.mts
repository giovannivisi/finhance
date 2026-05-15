import assert from "node:assert/strict";
import test from "node:test";
import {
  buildBudgetMonthNavigationLink,
  buildBudgetPageLink,
  buildBudgetTransactionsLink,
  buildBudgetsQueryString,
  getBudgetConfidenceMessage,
  getBudgetFilterSummaryStatus,
  getBudgetQuickFillSuggestions,
  getBudgetFilters,
  getCurrentRomeMonth,
  sortBudgetItemsForDisplay,
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
      secondaryCategoryId: "category-1",
    }),
    "/transactions?from=2026-04-01&to=2026-04-30&secondaryCategoryId=category-1&kind=EXPENSE",
  );
});

test("buildBudgetPageLink and month navigation preserve archived filters", () => {
  assert.equal(
    buildBudgetPageLink({
      month: "2026-04",
      includeArchivedCategories: true,
    }),
    "/budgets?month=2026-04&includeArchivedCategories=true",
  );
  assert.equal(
    buildBudgetMonthNavigationLink({
      month: "2026-04",
      delta: -1,
      includeArchivedCategories: true,
    }),
    "/budgets?month=2026-03&includeArchivedCategories=true",
  );
});

test("getBudgetFilterSummaryStatus shows month by default and active count for archived categories", () => {
  assert.equal(
    getBudgetFilterSummaryStatus({
      monthLabel: "April 2026",
      includeArchivedCategories: false,
    }),
    "April 2026",
  );
  assert.equal(
    getBudgetFilterSummaryStatus({
      monthLabel: "April 2026",
      includeArchivedCategories: true,
    }),
    "1 active",
  );
});

test("sortBudgetItemsForDisplay promotes over-budget rows first", () => {
  const items = sortBudgetItemsForDisplay([
    {
      budgetId: "within",
      categoryId: "1",
      categoryName: "Groceries",
      primaryCategoryId: "10",
      primaryCategoryName: "Food",
      secondaryCategoryId: "1",
      secondaryCategoryName: "Groceries",
      categoryArchivedAt: null,
      currency: "EUR",
      budgetAmount: 100,
      spentAmount: 40,
      remainingAmount: 60,
      usageRatio: 0.4,
      status: "WITHIN_BUDGET",
      previousMonthExpense: null,
      averageExpenseLast3Months: null,
      startMonth: "2026-04",
      endMonth: null,
      override: null,
    },
    {
      budgetId: "over",
      categoryId: "2",
      categoryName: "Rent",
      primaryCategoryId: "20",
      primaryCategoryName: "Housing",
      secondaryCategoryId: "2",
      secondaryCategoryName: "Rent",
      categoryArchivedAt: null,
      currency: "EUR",
      budgetAmount: 100,
      spentAmount: 180,
      remainingAmount: -80,
      usageRatio: 1.8,
      status: "OVER_BUDGET",
      previousMonthExpense: null,
      averageExpenseLast3Months: null,
      startMonth: "2026-04",
      endMonth: null,
      override: null,
    },
  ]);

  assert.equal(items[0]?.budgetId, "over");
});

test("getBudgetQuickFillSuggestions returns available history suggestions", () => {
  assert.deepEqual(
    getBudgetQuickFillSuggestions({
      previousMonthExpense: 120,
      averageExpenseLast3Months: 90,
    }),
    [
      { key: "previous", label: "Use previous month", amount: 120 },
      { key: "average", label: "Use 3-month average", amount: 90 },
    ],
  );
});

test("getBudgetConfidenceMessage distinguishes uncategorized and unbudgeted gaps", () => {
  assert.equal(
    getBudgetConfidenceMessage({
      currency: "EUR",
      unbudgetedExpenseTotal: 0,
      uncategorizedExpenseTotal: 10,
    }).tone,
    "warning",
  );
  assert.equal(
    getBudgetConfidenceMessage({
      currency: "EUR",
      unbudgetedExpenseTotal: 10,
      uncategorizedExpenseTotal: 0,
    }).tone,
    "info",
  );
  assert.equal(
    getBudgetConfidenceMessage({
      currency: "EUR",
      unbudgetedExpenseTotal: 0,
      uncategorizedExpenseTotal: 0,
    }).tone,
    "success",
  );
});
