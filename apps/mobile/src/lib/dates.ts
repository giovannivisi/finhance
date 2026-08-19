import { getFormatConfig, type FormatConfig } from "./format-config";

const MONTH_PATTERN = /^\d{4}-\d{2}$/;
const LOCAL_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

type DateFormatOptions = Intl.DateTimeFormatOptions & {
  locale?: string;
};

const dateFormatterCache = new Map<string, Intl.DateTimeFormat>();

function getDateFormatter(options: DateFormatOptions): Intl.DateTimeFormat {
  const locale = options.locale ?? getFormatConfig().locale;
  const { locale: _locale, ...dateOptions } = options;
  const key = `${locale}|${JSON.stringify(dateOptions)}`;
  const cached = dateFormatterCache.get(key);

  if (cached) {
    return cached;
  }

  try {
    const formatter = new Intl.DateTimeFormat(locale, dateOptions);
    dateFormatterCache.set(key, formatter);
    return formatter;
  } catch {
    const formatter = new Intl.DateTimeFormat("en-GB", dateOptions);
    dateFormatterCache.set(key, formatter);
    return formatter;
  }
}

function toDateFromLocalDate(localDate: string): Date {
  const [yearRaw, monthRaw, dayRaw] = localDate.split("-");
  return new Date(Number(yearRaw), Number(monthRaw) - 1, Number(dayRaw));
}

function resolveFormatOptions(
  options: Partial<FormatConfig> = {},
): FormatConfig {
  return {
    ...getFormatConfig(),
    ...options,
  };
}

function formatMonthName(
  monthIndex: number,
  width: "long" | "short",
  locale: string,
): string {
  return getDateFormatter({ locale, month: width }).format(
    new Date(2026, monthIndex, 1),
  );
}

export function isMonthString(value: string): boolean {
  return MONTH_PATTERN.test(value);
}

export function isLocalDateString(value: string): boolean {
  return LOCAL_DATE_PATTERN.test(value);
}

/**
 * Converts a date picked in the user's local timezone to an ISO timestamp.
 * Noon avoids a date rollover around daylight-saving transitions while the
 * API still receives an unambiguous value instead of a date-only string.
 */
export function localDateToIso(localDate: string): string | null {
  if (!isLocalDateString(localDate)) {
    return null;
  }

  const year = Number(localDate.slice(0, 4));
  const month = Number(localDate.slice(5, 7));
  const day = Number(localDate.slice(8, 10));
  const date = new Date(year, month - 1, day, 12, 0, 0, 0);

  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }

  return date.toISOString();
}

export function currentMonth(now: Date = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export function todayLocalDate(now: Date = new Date()): string {
  return `${currentMonth(now)}-${String(now.getDate()).padStart(2, "0")}`;
}

export function addMonths(month: string, delta: number): string {
  const [yearRaw, monthRaw] = month.split("-");
  const year = Number(yearRaw);
  const monthIndex = Number(monthRaw) - 1;
  const total = year * 12 + monthIndex + delta;
  const nextYear = Math.floor(total / 12);
  const nextMonthIndex = ((total % 12) + 12) % 12;
  return `${nextYear}-${String(nextMonthIndex + 1).padStart(2, "0")}`;
}

export function compareMonths(left: string, right: string): number {
  return left.localeCompare(right);
}

export function monthRange(from: string, to: string): string[] {
  const months: string[] = [];
  let cursor = from;

  while (compareMonths(cursor, to) <= 0 && months.length < 600) {
    months.push(cursor);
    cursor = addMonths(cursor, 1);
  }

  return months;
}

export function daysInMonth(month: string): number {
  const [yearRaw, monthRaw] = month.split("-");
  return new Date(Number(yearRaw), Number(monthRaw), 0).getDate();
}

export function monthBounds(month: string): { from: string; to: string } {
  return {
    from: `${month}-01`,
    to: `${month}-${String(daysInMonth(month)).padStart(2, "0")}`,
  };
}

export function formatMonthLabel(
  month: string,
  options: Partial<FormatConfig> = {},
): string {
  if (!isMonthString(month)) {
    return month;
  }

  const config = resolveFormatOptions(options);
  const [yearRaw, monthRaw] = month.split("-");
  const date = new Date(Number(yearRaw), Number(monthRaw) - 1, 1);

  return getDateFormatter({
    locale: config.locale,
    month: "long",
    year: "numeric",
  }).format(date);
}

export function formatShortMonthLabel(
  month: string,
  options: Partial<FormatConfig> = {},
): string {
  if (!isMonthString(month)) {
    return month;
  }

  const config = resolveFormatOptions(options);
  const [yearRaw, monthRaw] = month.split("-");
  const date = new Date(Number(yearRaw), Number(monthRaw) - 1, 1);

  return getDateFormatter({
    locale: config.locale,
    month: "short",
    year: "2-digit",
  }).format(date);
}

export function localDateOf(isoTimestamp: string): string {
  const date = new Date(isoTimestamp);

  if (Number.isNaN(date.getTime())) {
    return isoTimestamp.slice(0, 10);
  }

  return todayLocalDate(date);
}

export function monthOf(isoTimestamp: string): string {
  return localDateOf(isoTimestamp).slice(0, 7);
}

export function formatDayHeading(
  localDate: string,
  now: Date = new Date(),
  options: Partial<FormatConfig> = {},
): string {
  if (!isLocalDateString(localDate)) {
    return localDate;
  }

  const today = todayLocalDate(now);

  if (localDate === today) {
    return "Today";
  }

  if (localDate === todayLocalDate(new Date(now.getTime() - 86_400_000))) {
    return "Yesterday";
  }

  const config = resolveFormatOptions(options);
  const [yearRaw, monthRaw, dayRaw] = localDate.split("-");
  const date = toDateFromLocalDate(localDate);
  const sameYear = String(now.getFullYear()) === yearRaw;

  if (config.locale === "en-GB") {
    const weekday = getDateFormatter({
      locale: config.locale,
      weekday: "long",
    }).format(date);
    const monthName = formatMonthName(
      Number(monthRaw) - 1,
      "long",
      config.locale,
    );

    return `${weekday} ${Number(dayRaw)} ${monthName}${
      sameYear ? "" : ` ${yearRaw}`
    }`;
  }

  return getDateFormatter({
    locale: config.locale,
    weekday: "long",
    day: "numeric",
    month: "long",
    ...(sameYear ? {} : { year: "numeric" }),
  }).format(date);
}

export function formatDateLabel(
  localDate: string,
  options: Partial<FormatConfig> = {},
): string {
  if (!isLocalDateString(localDate)) {
    return localDate;
  }

  const config = resolveFormatOptions(options);
  return getDateFormatter({
    locale: config.locale,
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(toDateFromLocalDate(localDate));
}

export function formatTimeLabel(
  isoTimestamp: string,
  options: Partial<FormatConfig> = {},
): string {
  const date = new Date(isoTimestamp);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const config = resolveFormatOptions(options);

  return getDateFormatter({
    locale: config.locale,
    hour: "2-digit",
    minute: "2-digit",
    hour12: config.hour12,
  }).format(date);
}

export function formatTimestampLabel(
  isoTimestamp: string,
  options: Partial<FormatConfig> = {},
): string {
  const date = new Date(isoTimestamp);

  if (Number.isNaN(date.getTime())) {
    return isoTimestamp;
  }

  return `${formatDateLabel(localDateOf(isoTimestamp), options)}, ${formatTimeLabel(
    isoTimestamp,
    options,
  )}`;
}
