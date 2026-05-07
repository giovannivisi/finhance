import type {
  CategoryResponse,
  ExpenseValidationRuleResponse,
} from "@finhance/shared";

export interface CategoryHierarchyLike {
  primaryCategoryId: string | null;
  primaryCategoryName: string | null;
  secondaryCategoryId: string | null;
  secondaryCategoryName: string | null;
}

export interface GroupableHierarchyRow extends CategoryHierarchyLike {
  categoryId?: string | null;
}

function isSelectableCategory(
  category: CategoryResponse,
  selectedId: string | null | undefined,
): boolean {
  return category.archivedAt === null || category.id === selectedId;
}

export function normalizeExpenseValidationEntry(value: string): string {
  return value.trim().toLocaleLowerCase("en-US");
}

export function findCategoryById(
  categories: CategoryResponse[],
  categoryId: string | null | undefined,
): CategoryResponse | null {
  if (!categoryId) {
    return null;
  }

  return categories.find((category) => category.id === categoryId) ?? null;
}

export function deriveExpensePrimaryId(
  categories: CategoryResponse[],
  categoryId: string | null | undefined,
): string {
  const category = findCategoryById(categories, categoryId);
  if (!category || category.type !== "EXPENSE") {
    return "";
  }

  return category.parentCategoryId ?? category.id;
}

export function expensePrimaryCategories(
  categories: CategoryResponse[],
  selectedId?: string | null,
): CategoryResponse[] {
  return categories.filter(
    (category) =>
      category.type === "EXPENSE" &&
      category.isPrimary &&
      isSelectableCategory(category, selectedId),
  );
}

export function expenseSecondaryCategories(
  categories: CategoryResponse[],
  primaryCategoryId: string,
  selectedId?: string | null,
): CategoryResponse[] {
  return categories.filter(
    (category) =>
      category.type === "EXPENSE" &&
      category.isSecondary &&
      category.parentCategoryId === primaryCategoryId &&
      isSelectableCategory(category, selectedId),
  );
}

export function incomeCategories(
  categories: CategoryResponse[],
  selectedId?: string | null,
): CategoryResponse[] {
  return categories.filter(
    (category) =>
      category.type === "INCOME" && isSelectableCategory(category, selectedId),
  );
}

export function expenseBudgetCategories(
  categories: CategoryResponse[],
  selectedId?: string | null,
): CategoryResponse[] {
  return categories.filter(
    (category) =>
      category.type === "EXPENSE" &&
      category.isSecondary &&
      isSelectableCategory(category, selectedId),
  );
}

export function findMatchingExpenseValidationRule(
  rules: ExpenseValidationRuleResponse[],
  description: string,
): ExpenseValidationRuleResponse | null {
  const normalizedEntry = normalizeExpenseValidationEntry(description);
  if (!normalizedEntry) {
    return null;
  }

  return rules.find((rule) => rule.normalizedEntry === normalizedEntry) ?? null;
}

export function expenseSecondaryLookup(
  rules: ExpenseValidationRuleResponse[],
): Map<string, ExpenseValidationRuleResponse> {
  return new Map(rules.map((rule) => [rule.secondaryCategoryId, rule]));
}

export function groupCategories(categories: CategoryResponse[]): {
  income: CategoryResponse[];
  expensePrimaries: Array<{
    primary: CategoryResponse;
    secondaries: CategoryResponse[];
  }>;
} {
  const income = categories.filter((category) => category.type === "INCOME");
  const expenseRoots = categories.filter(
    (category) => category.type === "EXPENSE" && category.isPrimary,
  );

  return {
    income,
    expensePrimaries: expenseRoots.map((primary) => ({
      primary,
      secondaries: categories.filter(
        (category) =>
          category.type === "EXPENSE" &&
          category.parentCategoryId === primary.id,
      ),
    })),
  };
}

export function formatHierarchyName(
  category: CategoryHierarchyLike,
  fallbackName: string,
): string {
  if (category.primaryCategoryName && category.secondaryCategoryName) {
    return `${category.primaryCategoryName} / ${category.secondaryCategoryName}`;
  }

  return (
    category.secondaryCategoryName ??
    category.primaryCategoryName ??
    fallbackName
  );
}

export function groupRowsByPrimary<T extends GroupableHierarchyRow>(
  rows: T[],
  getFallbackName: (row: T) => string,
): Array<{ key: string; label: string; items: T[] }> {
  const groups = new Map<string, { label: string; items: T[] }>();

  for (const row of rows) {
    const key = row.primaryCategoryId ?? row.categoryId ?? getFallbackName(row);
    const label = row.primaryCategoryName ?? getFallbackName(row);
    const existing = groups.get(key);
    if (existing) {
      existing.items.push(row);
      continue;
    }

    groups.set(key, {
      label,
      items: [row],
    });
  }

  return [...groups.entries()]
    .map(([key, value]) => ({
      key,
      label: value.label,
      items: value.items,
    }))
    .sort((left, right) => left.label.localeCompare(right.label));
}
