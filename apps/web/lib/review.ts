import type {
  MonthlyReviewWarningCode,
  MonthlyReviewWarningResponse,
} from "@finhance/shared";

const ROME_MONTH_FORMATTER = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Rome",
  year: "numeric",
  month: "2-digit",
});

export interface ReviewLinkAction {
  href: string;
  label: string;
}

export function getReviewMonthDateRange(month: string): {
  from: string;
  to: string;
} {
  const [year, monthValue] = month.split("-").map(Number);

  if (!year || !monthValue || monthValue < 1 || monthValue > 12) {
    throw new Error(`Invalid month ${month}.`);
  }

  const lastDay = new Date(Date.UTC(year, monthValue, 0)).getUTCDate();

  return {
    from: `${month}-01`,
    to: `${month}-${String(lastDay).padStart(2, "0")}`,
  };
}

export function isCurrentReviewMonth(month: string, now = new Date()): boolean {
  return ROME_MONTH_FORMATTER.format(now) === month;
}

export function shouldOfferSnapshotCapture(
  month: string,
  warnings: MonthlyReviewWarningResponse[],
  now = new Date(),
): boolean {
  return (
    isCurrentReviewMonth(month, now) &&
    warnings.some((warning) => warning.code === "MISSING_CLOSING_SNAPSHOT")
  );
}

export function getReviewWarningLink(
  code: MonthlyReviewWarningCode,
  month: string,
): ReviewLinkAction | null {
  const { from, to } = getReviewMonthDateRange(month);

  switch (code) {
    case "MISSING_OPENING_SNAPSHOT":
    case "MISSING_CLOSING_SNAPSHOT":
    case "PARTIAL_OPENING_SNAPSHOT":
    case "PARTIAL_CLOSING_SNAPSHOT":
      return { href: "/history", label: "Open history" };
    case "NON_EUR_CASHFLOW_NOT_COMPARABLE":
    case "UNCATEGORIZED_EXPENSES":
    case "UNCATEGORIZED_INCOME":
      return {
        href: `/transactions?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
        label: "Open transactions",
      };
    case "RECONCILIATION_ISSUES":
      return { href: "/accounts", label: "Open accounts" };
    case "RECURRING_EXCEPTIONS_PRESENT":
      return { href: "/recurring", label: "Open recurring rules" };
    case "OVER_BUDGET_CATEGORIES":
    case "UNBUDGETED_EXPENSES":
      return {
        href: `/budgets?month=${encodeURIComponent(month)}`,
        label: "Open budgets",
      };
    default:
      return null;
  }
}
