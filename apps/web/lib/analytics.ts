export interface AnalyticsFilters {
  from: string;
  to: string;
  accountId: string;
  categoryId: string;
  includeArchivedAccounts: boolean;
}

const MONTH_FORMATTER = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Rome",
  year: "numeric",
  month: "2-digit",
});

function parseMonth(month: string): { year: number; month: number } {
  const [year, monthNumber] = month.split("-").map(Number);

  if (!year || !monthNumber) {
    throw new Error(`Invalid month ${month}.`);
  }

  return {
    year,
    month: monthNumber,
  };
}

export function getCurrentRomeMonth(date = new Date()): string {
  return MONTH_FORMATTER.format(date);
}

export function addMonthsToMonth(month: string, delta: number): string {
  const parsed = parseMonth(month);
  const next = new Date(Date.UTC(parsed.year, parsed.month - 1 + delta, 1));

  return [
    next.getUTCFullYear(),
    String(next.getUTCMonth() + 1).padStart(2, "0"),
  ].join("-");
}

export function getDefaultAnalyticsFilters(
  date = new Date(),
): AnalyticsFilters {
  const to = getCurrentRomeMonth(date);

  return {
    from: addMonthsToMonth(to, -5),
    to,
    accountId: "",
    categoryId: "",
    includeArchivedAccounts: false,
  };
}

function getSingleValue(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

function parseBoolean(value: string | string[] | undefined): boolean {
  return getSingleValue(value) === "true";
}

function isValidMonth(value: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

export function getAnalyticsFilters(
  searchParams: Record<string, string | string[] | undefined>,
  date = new Date(),
): AnalyticsFilters {
  const defaults = getDefaultAnalyticsFilters(date);
  const from = getSingleValue(searchParams.from);
  const to = getSingleValue(searchParams.to);

  return {
    from: isValidMonth(from) ? from : defaults.from,
    to: isValidMonth(to) ? to : defaults.to,
    accountId: getSingleValue(searchParams.accountId),
    categoryId: getSingleValue(searchParams.categoryId),
    includeArchivedAccounts: parseBoolean(searchParams.includeArchivedAccounts),
  };
}

export function buildAnalyticsQueryString(filters: AnalyticsFilters): string {
  const params = new URLSearchParams();
  params.set("from", filters.from);
  params.set("to", filters.to);

  if (filters.accountId) {
    params.set("accountId", filters.accountId);
  }

  if (filters.categoryId) {
    params.set("categoryId", filters.categoryId);
  }

  if (filters.includeArchivedAccounts) {
    params.set("includeArchivedAccounts", "true");
  }

  return params.toString();
}

export function getMonthDateRange(month: string): { from: string; to: string } {
  const parsed = parseMonth(month);
  const start = `${month}-01`;
  const endDate = new Date(Date.UTC(parsed.year, parsed.month, 0));
  const end = [
    endDate.getUTCFullYear(),
    String(endDate.getUTCMonth() + 1).padStart(2, "0"),
    String(endDate.getUTCDate()).padStart(2, "0"),
  ].join("-");

  return {
    from: start,
    to: end,
  };
}

export function buildTransactionsLink(input: {
  from?: string;
  to?: string;
  month?: string;
  accountId?: string;
  categoryId?: string | null;
  kind?: string;
  includeArchivedAccounts?: boolean;
}): string {
  const params = new URLSearchParams();
  const range = input.month ? getMonthDateRange(input.month) : null;
  const from = input.from ?? range?.from;
  const to = input.to ?? range?.to;

  if (from) {
    params.set("from", from);
  }

  if (to) {
    params.set("to", to);
  }

  if (input.accountId) {
    params.set("accountId", input.accountId);
  }

  if (input.categoryId) {
    params.set("categoryId", input.categoryId);
  }

  if (input.kind) {
    params.set("kind", input.kind);
  }

  if (input.includeArchivedAccounts) {
    params.set("includeArchivedAccounts", "true");
  }

  const queryString = params.toString();
  return queryString ? `/transactions?${queryString}` : "/transactions";
}
