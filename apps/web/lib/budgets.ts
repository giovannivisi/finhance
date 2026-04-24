import type { BudgetUsageStatus } from "@finhance/shared";
import { buildTransactionsLink } from "./analytics.ts";

export interface BudgetFilters {
  month: string;
  includeArchivedCategories: boolean;
}

const MONTH_FORMATTER = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Rome",
  year: "numeric",
  month: "2-digit",
});

function getSingleValue(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

function isValidMonth(value: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

function parseBoolean(value: string | string[] | undefined): boolean {
  return getSingleValue(value) === "true";
}

export function getCurrentRomeMonth(date = new Date()): string {
  return MONTH_FORMATTER.format(date);
}

export function getDefaultBudgetFilters(date = new Date()): BudgetFilters {
  return {
    month: getCurrentRomeMonth(date),
    includeArchivedCategories: false,
  };
}

export function getBudgetFilters(
  searchParams: Record<string, string | string[] | undefined>,
  date = new Date(),
): BudgetFilters {
  const defaults = getDefaultBudgetFilters(date);
  const month = getSingleValue(searchParams.month);

  return {
    month: isValidMonth(month) ? month : defaults.month,
    includeArchivedCategories: parseBoolean(
      searchParams.includeArchivedCategories,
    ),
  };
}

export function buildBudgetsQueryString(filters: BudgetFilters): string {
  const params = new URLSearchParams();
  params.set("month", filters.month);

  if (filters.includeArchivedCategories) {
    params.set("includeArchivedCategories", "true");
  }

  return params.toString();
}

export function buildBudgetTransactionsLink(input: {
  month: string;
  categoryId?: string;
}): string {
  return buildTransactionsLink({
    month: input.month,
    categoryId: input.categoryId,
    kind: "EXPENSE",
  });
}

export function getBudgetStatusLabel(status: BudgetUsageStatus): string {
  switch (status) {
    case "OVER_BUDGET":
      return "Over budget";
    case "AT_LIMIT":
      return "At limit";
    case "WITHIN_BUDGET":
      return "Within budget";
    default:
      return "Budget";
  }
}

export function getBudgetStatusClasses(status: BudgetUsageStatus): string {
  switch (status) {
    case "OVER_BUDGET":
      return "bg-red-100 text-red-800";
    case "AT_LIMIT":
      return "bg-amber-100 text-amber-800";
    case "WITHIN_BUDGET":
      return "bg-emerald-100 text-emerald-800";
    default:
      return "bg-gray-100 text-gray-700";
  }
}
