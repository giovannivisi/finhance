const MONTH_PATTERN = /^\d{4}-\d{2}$/;
const LOCAL_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

export function isMonthString(value: string): boolean {
  return MONTH_PATTERN.test(value);
}

export function isLocalDateString(value: string): boolean {
  return LOCAL_DATE_PATTERN.test(value);
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

export function formatMonthLabel(month: string): string {
  if (!isMonthString(month)) {
    return month;
  }

  const [year, monthRaw] = month.split("-");
  const monthName = MONTH_NAMES[Number(monthRaw) - 1] ?? monthRaw;
  return `${monthName} ${year}`;
}

export function formatShortMonthLabel(month: string): string {
  if (!isMonthString(month)) {
    return month;
  }

  const [year, monthRaw] = month.split("-");
  const monthName = MONTH_NAMES[Number(monthRaw) - 1]?.slice(0, 3) ?? monthRaw;
  return `${monthName} ${year?.slice(2)}`;
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

  const [yearRaw, monthRaw, dayRaw] = localDate.split("-");
  const date = new Date(Number(yearRaw), Number(monthRaw) - 1, Number(dayRaw));
  const weekday = date.toLocaleDateString("en-GB", { weekday: "long" });
  const monthName = MONTH_NAMES[Number(monthRaw) - 1] ?? monthRaw;
  const sameYear = String(now.getFullYear()) === yearRaw;

  return `${weekday} ${Number(dayRaw)} ${monthName}${sameYear ? "" : ` ${yearRaw}`}`;
}

export function formatDateLabel(localDate: string): string {
  if (!isLocalDateString(localDate)) {
    return localDate;
  }

  const [yearRaw, monthRaw, dayRaw] = localDate.split("-");
  const monthName = MONTH_NAMES[Number(monthRaw) - 1]?.slice(0, 3) ?? monthRaw;
  return `${Number(dayRaw)} ${monthName} ${yearRaw}`;
}

export function formatTimeLabel(isoTimestamp: string): string {
  const date = new Date(isoTimestamp);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return date.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatTimestampLabel(isoTimestamp: string): string {
  const date = new Date(isoTimestamp);

  if (Number.isNaN(date.getTime())) {
    return isoTimestamp;
  }

  return `${formatDateLabel(localDateOf(isoTimestamp))}, ${formatTimeLabel(isoTimestamp)}`;
}
