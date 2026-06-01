import type { CategoryResponse, CategoryType } from "@finhance/shared";

export const CATEGORY_TYPE_OPTIONS: CategoryType[] = ["EXPENSE", "INCOME"];

export const CATEGORY_TYPE_LABELS: Record<CategoryType, string> = {
  EXPENSE: "Expense",
  INCOME: "Income",
};

export function formatCategoryOptionLabel(category: CategoryResponse): string {
  return `${category.name} (${CATEGORY_TYPE_LABELS[category.type]}${category.archivedAt ? ", Archived" : ""})`;
}
