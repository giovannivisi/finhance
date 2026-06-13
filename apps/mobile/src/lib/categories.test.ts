import { describe, expect, it } from "vitest";
import type { CategoryResponse } from "@finhance/shared";

import {
  activityCategoryFilterQuery,
  activityCategoryFilterValue,
  categoryLabel,
  expensePrimaryCategories,
  expenseSecondaryCategories,
  isAssignableTransactionCategory,
} from "./categories";

function category(overrides: Partial<CategoryResponse> = {}): CategoryResponse {
  return {
    id: "category",
    name: "Category",
    type: "EXPENSE",
    parentCategoryId: null,
    parentCategoryName: null,
    isPrimary: true,
    isSecondary: false,
    order: 0,
    archivedAt: null,
    canDeletePermanently: false,
    deleteBlockReason: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("categoryLabel", () => {
  it("includes the parent name for secondary categories", () => {
    expect(
      categoryLabel(
        category({
          name: "Groceries",
          parentCategoryName: "Household",
        }),
      ),
    ).toBe("Household · Groceries");
  });
});

describe("isAssignableTransactionCategory", () => {
  it("allows only secondary expense categories for expense transactions", () => {
    const primary = category({
      id: "primary",
      name: "Household",
      isPrimary: true,
      isSecondary: false,
    });
    const secondary = category({
      id: "secondary",
      name: "Groceries",
      parentCategoryId: "primary",
      parentCategoryName: "Household",
      isPrimary: false,
      isSecondary: true,
    });

    expect(isAssignableTransactionCategory(primary, "EXPENSE")).toBe(false);
    expect(isAssignableTransactionCategory(secondary, "EXPENSE")).toBe(true);
  });

  it("allows flat income categories for income transactions", () => {
    const income = category({
      id: "income",
      name: "Salary",
      type: "INCOME",
      isPrimary: false,
      isSecondary: false,
    });

    expect(isAssignableTransactionCategory(income, "INCOME")).toBe(true);
    expect(isAssignableTransactionCategory(income, "EXPENSE")).toBe(false);
  });

  it("keeps the current archived category selectable while editing", () => {
    const archivedSecondary = category({
      id: "archived-secondary",
      name: "Groceries",
      parentCategoryId: "primary",
      parentCategoryName: "Household",
      isPrimary: false,
      isSecondary: true,
      archivedAt: "2026-06-01T00:00:00.000Z",
    });

    expect(isAssignableTransactionCategory(archivedSecondary, "EXPENSE")).toBe(
      false,
    );
    expect(
      isAssignableTransactionCategory(
        archivedSecondary,
        "EXPENSE",
        "archived-secondary",
      ),
    ).toBe(true);
  });
});

describe("expense category selectors", () => {
  it("returns active expense primaries and keeps the selected archived primary", () => {
    const activePrimary = category({
      id: "active-primary",
      name: "Household",
      isPrimary: true,
      isSecondary: false,
    });
    const archivedPrimary = category({
      id: "archived-primary",
      name: "Travel",
      isPrimary: true,
      isSecondary: false,
      archivedAt: "2026-06-01T00:00:00.000Z",
    });
    const income = category({
      id: "income",
      type: "INCOME",
      isPrimary: false,
      isSecondary: false,
    });

    expect(
      expensePrimaryCategories([archivedPrimary, activePrimary, income]).map(
        (entry) => entry.id,
      ),
    ).toEqual(["active-primary"]);
    expect(
      expensePrimaryCategories(
        [archivedPrimary, activePrimary, income],
        "archived-primary",
      ).map((entry) => entry.id),
    ).toEqual(["archived-primary", "active-primary"]);
  });

  it("returns active expense secondaries for the selected primary", () => {
    const groceries = category({
      id: "groceries",
      name: "Groceries",
      parentCategoryId: "household",
      parentCategoryName: "Household",
      isPrimary: false,
      isSecondary: true,
    });
    const archivedUtilities = category({
      id: "utilities",
      name: "Utilities",
      parentCategoryId: "household",
      parentCategoryName: "Household",
      isPrimary: false,
      isSecondary: true,
      archivedAt: "2026-06-01T00:00:00.000Z",
    });
    const travel = category({
      id: "flights",
      name: "Flights",
      parentCategoryId: "travel",
      parentCategoryName: "Travel",
      isPrimary: false,
      isSecondary: true,
    });

    expect(
      expenseSecondaryCategories(
        [groceries, archivedUtilities, travel],
        "household",
      ).map((entry) => entry.id),
    ).toEqual(["groceries"]);
    expect(
      expenseSecondaryCategories(
        [groceries, archivedUtilities, travel],
        "household",
        "utilities",
      ).map((entry) => entry.id),
    ).toEqual(["groceries", "utilities"]);
  });
});

describe("activityCategoryFilterValue", () => {
  it("uses hierarchy-aware values for expense filters", () => {
    expect(
      activityCategoryFilterValue(
        category({
          id: "primary",
          isPrimary: true,
          isSecondary: false,
        }),
      ),
    ).toBe("primary:primary");
    expect(
      activityCategoryFilterValue(
        category({
          id: "secondary",
          parentCategoryId: "primary",
          isPrimary: false,
          isSecondary: true,
        }),
      ),
    ).toBe("secondary:secondary");
  });

  it("uses a category id filter for income categories", () => {
    expect(
      activityCategoryFilterValue(
        category({
          id: "income",
          type: "INCOME",
          isPrimary: false,
          isSecondary: false,
        }),
      ),
    ).toBe("category:income");
  });
});

describe("activityCategoryFilterQuery", () => {
  it("maps filter values to the API query fields", () => {
    expect(activityCategoryFilterQuery("ALL")).toEqual({});
    expect(activityCategoryFilterQuery("primary:primary")).toEqual({
      primaryCategoryId: "primary",
    });
    expect(activityCategoryFilterQuery("secondary:secondary")).toEqual({
      secondaryCategoryId: "secondary",
    });
    expect(activityCategoryFilterQuery("category:income")).toEqual({
      categoryId: "income",
    });
  });
});
