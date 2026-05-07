import type { CategoryResponse, CategoryType } from "@finhance/shared";

export const CATEGORY_TYPE_OPTIONS: CategoryType[] = ["EXPENSE", "INCOME"];

export const CATEGORY_TYPE_LABELS: Record<CategoryType, string> = {
  EXPENSE: "Expense",
  INCOME: "Income",
};

export function formatCategoryName(category: CategoryResponse): string {
  if (category.parentCategoryName) {
    return `${category.parentCategoryName} / ${category.name}`;
  }

  return category.name;
}

export function formatCategoryOptionLabel(category: CategoryResponse): string {
  const hierarchyLabel = formatCategoryName(category);
  const roleLabel =
    category.type === "EXPENSE"
      ? category.isPrimary
        ? ", Primary"
        : category.isSecondary
          ? ", Secondary"
          : ""
      : "";

  return `${hierarchyLabel} (${CATEGORY_TYPE_LABELS[category.type]}${roleLabel}${category.archivedAt ? ", Archived" : ""})`;
}
