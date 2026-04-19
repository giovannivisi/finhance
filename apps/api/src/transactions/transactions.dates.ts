const ROME_TIME_ZONE = 'Europe/Rome';
const ROME_DATE_TIME_FORMATTER = new Intl.DateTimeFormat('en-US', {
  timeZone: ROME_TIME_ZONE,
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});
const ROME_MONTH_FORMATTER = new Intl.DateTimeFormat('en-US', {
  timeZone: ROME_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
});

function extractPart(parts: Intl.DateTimeFormatPart[], type: string): number {
  const value = parts.find((part) => part.type === type)?.value;

  if (!value) {
    throw new Error(`Unable to extract ${type} for Europe/Rome conversion.`);
  }

  return Number(value);
}

function getTimeZoneOffsetMs(date: Date): number {
  const parts = ROME_DATE_TIME_FORMATTER.formatToParts(date);
  const year = extractPart(parts, 'year');
  const month = extractPart(parts, 'month');
  const day = extractPart(parts, 'day');
  const hour = extractPart(parts, 'hour');
  const minute = extractPart(parts, 'minute');
  const second = extractPart(parts, 'second');

  return Date.UTC(year, month - 1, day, hour, minute, second) - date.getTime();
}

function zonedDateTimeToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
  millisecond = 0,
): Date {
  const targetUtc = Date.UTC(
    year,
    month - 1,
    day,
    hour,
    minute,
    second,
    millisecond,
  );
  let current = targetUtc;

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const offset = getTimeZoneOffsetMs(new Date(current));
    const next = targetUtc - offset;

    if (next === current) {
      break;
    }

    current = next;
  }

  return new Date(current);
}

function parseLocalDate(dateString: string): {
  year: number;
  month: number;
  day: number;
} {
  const [year, month, day] = dateString.split('-').map(Number);

  if (!year || !month || !day) {
    throw new Error(`Invalid local date ${dateString}.`);
  }

  return { year, month, day };
}

function parseLocalMonth(monthString: string): {
  year: number;
  month: number;
} {
  const [year, month] = monthString.split('-').map(Number);

  if (!year || !month || month < 1 || month > 12) {
    throw new Error(`Invalid local month ${monthString}.`);
  }

  return { year, month };
}

function addDays(
  dateString: string,
  amount: number,
): {
  year: number;
  month: number;
  day: number;
} {
  const { year, month, day } = parseLocalDate(dateString);
  const next = new Date(Date.UTC(year, month - 1, day + amount));

  return {
    year: next.getUTCFullYear(),
    month: next.getUTCMonth() + 1,
    day: next.getUTCDate(),
  };
}

function addMonths(
  monthString: string,
  amount: number,
): {
  year: number;
  month: number;
} {
  const { year, month } = parseLocalMonth(monthString);
  const next = new Date(Date.UTC(year, month - 1 + amount, 1));

  return {
    year: next.getUTCFullYear(),
    month: next.getUTCMonth() + 1,
  };
}

export function romeDateToUtcStart(dateString: string): Date {
  const { year, month, day } = parseLocalDate(dateString);
  return zonedDateTimeToUtc(year, month, day, 0, 0, 0, 0);
}

export function romeDateToUtcExclusiveEnd(dateString: string): Date {
  const next = addDays(dateString, 1);
  return zonedDateTimeToUtc(next.year, next.month, next.day, 0, 0, 0, 0);
}

export function romeMonthToUtcStart(monthString: string): Date {
  const { year, month } = parseLocalMonth(monthString);
  return zonedDateTimeToUtc(year, month, 1, 0, 0, 0, 0);
}

export function romeMonthToUtcExclusiveEnd(monthString: string): Date {
  const next = addMonths(monthString, 1);
  return zonedDateTimeToUtc(next.year, next.month, 1, 0, 0, 0, 0);
}

export function addMonthsToRomeMonth(
  monthString: string,
  amount: number,
): string {
  const next = addMonths(monthString, amount);

  return [next.year, String(next.month).padStart(2, '0')].join('-');
}

export function diffRomeMonths(from: string, to: string): number {
  const fromMonth = parseLocalMonth(from);
  const toMonth = parseLocalMonth(to);

  return (
    (toMonth.year - fromMonth.year) * 12 + (toMonth.month - fromMonth.month)
  );
}

export function utcDateToRomeMonth(date: Date): string {
  const parts = ROME_MONTH_FORMATTER.formatToParts(date);
  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;

  if (!year || !month) {
    throw new Error('Unable to derive Europe/Rome month.');
  }

  return `${year}-${month}`;
}
