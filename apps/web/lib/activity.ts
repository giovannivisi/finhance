export interface ActivityFilters {
  from: string;
  to: string;
  accountId: string;
  categoryId: string;
  primaryCategoryId: string;
  secondaryCategoryId: string;
  kind: string;
  includeArchivedAccounts: boolean;
}

const ROME_DATE_FORMATTER = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Rome",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function getRomeDateParts(date = new Date()): {
  year: string;
  month: string;
  day: string;
} {
  const parts = ROME_DATE_FORMATTER.formatToParts(date);

  return {
    year: parts.find((part) => part.type === "year")?.value ?? "1970",
    month: parts.find((part) => part.type === "month")?.value ?? "01",
    day: parts.find((part) => part.type === "day")?.value ?? "01",
  };
}

export function getCurrentRomeDateString(date = new Date()): string {
  const parts = getRomeDateParts(date);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function getCurrentRomeYearStartString(date = new Date()): string {
  const parts = getRomeDateParts(date);
  return `${parts.year}-01-01`;
}

export function getRomeMonthStartString(date = new Date()): string {
  const parts = getRomeDateParts(date);
  return `${parts.year}-${parts.month}-01`;
}

export function getRomeMonthEndString(date = new Date()): string {
  const parts = getRomeDateParts(date);
  const lastDay = new Date(
    Date.UTC(Number(parts.year), Number(parts.month), 0),
  ).getUTCDate();

  return `${parts.year}-${parts.month}-${String(lastDay).padStart(2, "0")}`;
}

export function getLatestAvailableMonthActivityFilters(
  date = new Date(),
): ActivityFilters {
  return {
    from: getRomeMonthStartString(date),
    to: getRomeMonthEndString(date),
    accountId: "",
    categoryId: "",
    primaryCategoryId: "",
    secondaryCategoryId: "",
    kind: "",
    includeArchivedAccounts: false,
  };
}

export function getDefaultActivityFilters(date = new Date()): ActivityFilters {
  return {
    from: getCurrentRomeYearStartString(date),
    to: getCurrentRomeDateString(date),
    accountId: "",
    categoryId: "",
    primaryCategoryId: "",
    secondaryCategoryId: "",
    kind: "",
    includeArchivedAccounts: false,
  };
}
