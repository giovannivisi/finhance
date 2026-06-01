import type {
  BudgetUsageStatus,
  MonthlyBudgetCurrencySummaryResponse,
  MonthlyBudgetItemResponse,
} from "@finhance/shared";
import { addMonthsToMonth, buildTransactionsLink } from "./analytics.ts";

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

export function buildBudgetPageLink(filters: BudgetFilters): string {
  return `/budgets?${buildBudgetsQueryString(filters)}`;
}

export function buildBudgetMonthNavigationLink(input: {
  month: string;
  delta: number;
  includeArchivedCategories: boolean;
}): string {
  return buildBudgetPageLink({
    month: addMonthsToMonth(input.month, input.delta),
    includeArchivedCategories: input.includeArchivedCategories,
  });
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

export function sortBudgetItemsForDisplay(
  items: MonthlyBudgetItemResponse[],
): MonthlyBudgetItemResponse[] {
  const rank = (status: BudgetUsageStatus): number => {
    switch (status) {
      case "OVER_BUDGET":
        return 0;
      case "AT_LIMIT":
        return 1;
      case "WITHIN_BUDGET":
      default:
        return 2;
    }
  };

  return [...items].sort((left, right) => {
    const statusDelta = rank(left.status) - rank(right.status);
    if (statusDelta !== 0) {
      return statusDelta;
    }

    const leftVariance = Math.abs(left.spentAmount - left.budgetAmount);
    const rightVariance = Math.abs(right.spentAmount - right.budgetAmount);
    if (rightVariance !== leftVariance) {
      return rightVariance - leftVariance;
    }

    return left.categoryName.localeCompare(right.categoryName);
  });
}

export function getBudgetQuickFillSuggestions(input: {
  previousMonthExpense: number | null;
  averageExpenseLast3Months: number | null;
}): Array<{ key: "previous" | "average"; label: string; amount: number }> {
  const suggestions: Array<{
    key: "previous" | "average";
    label: string;
    amount: number;
  }> = [];

  if (input.previousMonthExpense !== null) {
    suggestions.push({
      key: "previous",
      label: "Use previous month",
      amount: input.previousMonthExpense,
    });
  }

  if (input.averageExpenseLast3Months !== null) {
    suggestions.push({
      key: "average",
      label: "Use 3-month average",
      amount: input.averageExpenseLast3Months,
    });
  }

  return suggestions;
}

export function getBudgetConfidenceMessage(
  currency: Pick<
    MonthlyBudgetCurrencySummaryResponse,
    "currency" | "unbudgetedExpenseTotal" | "uncategorizedExpenseTotal"
  >,
): { tone: "warning" | "info" | "success"; title: string; detail: string } {
  if (currency.uncategorizedExpenseTotal > 0) {
    return {
      tone: "warning",
      title: "Budget confidence is weak",
      detail: `${currency.currency} still has uncategorized expense. Clean that up before trusting the month’s budget coverage.`,
    };
  }

  if (currency.unbudgetedExpenseTotal > 0) {
    return {
      tone: "info",
      title: "Budget coverage is incomplete",
      detail: `${currency.currency} has categorized expense with no matching budget, so plan-versus-actual is only partial.`,
    };
  }

  return {
    tone: "success",
    title: "Budget coverage is clean",
    detail: `${currency.currency} has no uncategorized or unbudgeted expense weakening this month’s budget view.`,
  };
}

export function getBudgetCreatePanelContext(item: {
  categoryId: string;
  currency: string;
  previousMonthExpense: number | null;
  averageExpenseLast3Months: number | null;
}): {
  categoryId: string;
  currency: string;
  previousMonthExpense: number | null;
  averageExpenseLast3Months: number | null;
} {
  return {
    categoryId: item.categoryId,
    currency: item.currency,
    previousMonthExpense: item.previousMonthExpense,
    averageExpenseLast3Months: item.averageExpenseLast3Months,
  };
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
