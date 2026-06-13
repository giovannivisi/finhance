import type { CategoryResponse, CategoryType } from "@finhance/shared";

export type ActivityCategoryFilterValue =
  | "ALL"
  | `category:${string}`
  | `primary:${string}`
  | `secondary:${string}`;

export function categoryLabel(category: CategoryResponse): string {
  return category.parentCategoryName
    ? `${category.parentCategoryName} · ${category.name}`
    : category.name;
}

export function isAssignableTransactionCategory(
  category: CategoryResponse,
  type: CategoryType,
  currentCategoryId?: string | null,
): boolean {
  if (category.type !== type) {
    return false;
  }

  if (category.archivedAt && category.id !== currentCategoryId) {
    return false;
  }

  // Expense transactions are assigned to secondary categories; primaries only
  // group those leaves.
  if (type === "EXPENSE") {
    return category.isSecondary;
  }

  return !category.isSecondary;
}

function isSelectableCategory(
  category: CategoryResponse,
  selectedId?: string | null,
): boolean {
  return category.archivedAt === null || category.id === selectedId;
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

export function activityCategoryFilterValue(
  category: CategoryResponse,
): ActivityCategoryFilterValue {
  if (category.type === "EXPENSE" && category.isPrimary) {
    return `primary:${category.id}`;
  }

  if (category.type === "EXPENSE" && category.isSecondary) {
    return `secondary:${category.id}`;
  }

  return `category:${category.id}`;
}

export function activityCategoryFilterQuery(
  value: ActivityCategoryFilterValue,
):
  | {
      categoryId?: string;
      primaryCategoryId?: string;
      secondaryCategoryId?: string;
    }
  | Record<string, never> {
  if (value === "ALL") {
    return {};
  }

  const separatorIndex = value.indexOf(":");
  const kind = value.slice(0, separatorIndex);
  const id = value.slice(separatorIndex + 1);

  if (!id) {
    return {};
  }

  if (kind === "primary") {
    return { primaryCategoryId: id };
  }

  if (kind === "secondary") {
    return { secondaryCategoryId: id };
  }

  return { categoryId: id };
}
