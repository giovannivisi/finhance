import type {
  SplitTransactionFundingLegRequest,
  TransactionDirection,
  TransactionKind,
  TransactionResponse,
  UpsertTransactionRequest,
} from "@finhance/shared";

const ROME_TIME_ZONE = "Europe/Rome";
const ROME_DATE_FORMATTER = new Intl.DateTimeFormat("en-CA", {
  timeZone: ROME_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
const ROME_DATE_TIME_FORMATTER = new Intl.DateTimeFormat("en-US", {
  timeZone: ROME_TIME_ZONE,
  hourCycle: "h23",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

export interface TransactionFundingLegFormValue {
  accountId: string;
  amount: string;
}

export interface TransactionFormValues {
  postedAt: string;
  kind: TransactionKind;
  amount: string;
  description: string;
  notes: string;
  accountId: string;
  direction: TransactionDirection;
  categoryId: string;
  counterparty: string;
  sourceAccountId: string;
  destinationAccountId: string;
  fundingMode: "SINGLE" | "SPLIT";
  fundingLegs: TransactionFundingLegFormValue[];
}

const DEFAULT_TRANSACTION_KIND: TransactionKind = "EXPENSE";
const DEFAULT_TRANSACTION_DIRECTION: TransactionDirection = "OUTFLOW";

export function createEmptyTransactionFormValues(
  showTransactionTimes = true,
): TransactionFormValues {
  return {
    postedAt: showTransactionTimes
      ? toDateTimeLocalValue(new Date().toISOString())
      : toRomeDateInputValue(new Date().toISOString()),
    kind: DEFAULT_TRANSACTION_KIND,
    amount: "",
    description: "",
    notes: "",
    accountId: "",
    direction: DEFAULT_TRANSACTION_DIRECTION,
    categoryId: "",
    counterparty: "",
    sourceAccountId: "",
    destinationAccountId: "",
    fundingMode: "SINGLE",
    fundingLegs: createEmptyFundingLegs(),
  };
}

export function transactionToFormValues(
  transaction: TransactionResponse,
  showTransactionTimes = true,
): TransactionFormValues {
  return {
    postedAt: showTransactionTimes
      ? toDateTimeLocalValue(transaction.postedAt)
      : toRomeDateInputValue(transaction.postedAt),
    kind: transaction.kind,
    amount: String(transaction.amount),
    description: transaction.description,
    notes: transaction.notes ?? "",
    accountId: transaction.accountId ?? "",
    direction: transaction.direction ?? DEFAULT_TRANSACTION_DIRECTION,
    categoryId: transaction.categoryId ?? "",
    counterparty: transaction.counterparty ?? "",
    sourceAccountId: transaction.sourceAccountId ?? "",
    destinationAccountId: transaction.destinationAccountId ?? "",
    fundingMode:
      transaction.kind === "EXPENSE" &&
      (transaction.fundingLegs?.length ?? 0) >= 2
        ? "SPLIT"
        : "SINGLE",
    fundingLegs:
      transaction.kind === "EXPENSE" &&
      (transaction.fundingLegs?.length ?? 0) >= 2
        ? transaction.fundingLegs!.map((leg) => ({
            accountId: leg.accountId,
            amount: formatNumber(leg.amount),
          }))
        : createEmptyFundingLegs(),
  };
}

export function buildTransactionPayload(
  values: TransactionFormValues,
  options?: {
    showTransactionTimes?: boolean;
    existingPostedAt?: string | null;
    now?: Date;
  },
): {
  payload?: UpsertTransactionRequest;
  error?: string;
} {
  const postedAt = parsePostedAt(values.postedAt, {
    showTransactionTimes: options?.showTransactionTimes ?? true,
    existingPostedAt: options?.existingPostedAt ?? null,
    now: options?.now ?? new Date(),
  });
  const amount = parseNumber(values.amount);
  const description = values.description.trim();
  const notes = values.notes.trim() || null;

  if (!postedAt) {
    return { error: "Please enter a valid posting date." };
  }

  if (amount === null || amount <= 0) {
    return { error: "Please enter a positive amount." };
  }

  if (!description) {
    return { error: "Description is required." };
  }

  if (values.kind === "TRANSFER") {
    const sourceAccountId = values.sourceAccountId.trim();
    const destinationAccountId = values.destinationAccountId.trim();

    if (!sourceAccountId || !destinationAccountId) {
      return {
        error:
          "Transfers require both a source account and a destination account.",
      };
    }

    if (sourceAccountId === destinationAccountId) {
      return {
        error: "Transfers require two different accounts.",
      };
    }

    return {
      payload: {
        postedAt,
        kind: "TRANSFER",
        amount,
        description,
        notes,
        sourceAccountId,
        destinationAccountId,
      },
    };
  }

  const direction =
    values.kind === "EXPENSE"
      ? "OUTFLOW"
      : values.kind === "INCOME"
        ? "INFLOW"
        : values.direction;
  const categoryId =
    values.kind === "ADJUSTMENT" ? null : values.categoryId.trim() || null;

  if ((values.kind === "EXPENSE" || values.kind === "INCOME") && !categoryId) {
    return { error: "Please choose a category." };
  }

  if (values.kind === "ADJUSTMENT" && !direction) {
    return { error: "Adjustments require a direction." };
  }

  if (values.kind === "EXPENSE" && values.fundingMode === "SPLIT") {
    if (!categoryId) {
      return { error: "Please choose a category." };
    }

    const fundingLegs = normalizeFundingLegs(values.fundingLegs);
    if (fundingLegs.length < 2) {
      return {
        error: "Split-funded expenses require at least two funding legs.",
      };
    }

    const parsedLegs: SplitTransactionFundingLegRequest[] = [];
    for (const leg of fundingLegs) {
      const legAmount = parseNumber(leg.amount);
      if (!leg.accountId) {
        return {
          error: "Each funding leg must choose an account.",
        };
      }

      if (legAmount === null || legAmount <= 0) {
        return {
          error: "Each funding leg must use a positive amount.",
        };
      }

      parsedLegs.push({
        accountId: leg.accountId,
        amount: legAmount,
      });
    }

    if (new Set(parsedLegs.map((leg) => leg.accountId)).size !== parsedLegs.length) {
      return {
        error: "Split funding cannot reuse the same account twice.",
      };
    }

    const legTotal = parsedLegs.reduce((sum, leg) => sum + leg.amount, 0);
    if (Math.abs(legTotal - amount) > 0.000001) {
      return {
        error: "The main amount must match the sum of the funding legs.",
      };
    }

    return {
      payload: {
        postedAt,
        kind: "EXPENSE",
        amount,
        description,
        notes,
        categoryId,
        counterparty: values.counterparty.trim() || null,
        fundingLegs: parsedLegs,
      },
    };
  }

  const accountId = values.accountId.trim();
  if (!accountId) {
    return { error: "Please choose an account." };
  }

  return {
    payload: {
      postedAt,
      kind: values.kind,
      amount,
      description,
      notes,
      accountId,
      direction,
      categoryId,
      counterparty: values.counterparty.trim() || null,
    },
  };
}

export function createEmptyFundingLegs(): TransactionFundingLegFormValue[] {
  return [
    { accountId: "", amount: "" },
    { accountId: "", amount: "" },
  ];
}

export function toDateTimeLocalValue(isoString: string): string {
  const date = new Date(isoString);
  const localDate = new Date(
    date.getTime() - date.getTimezoneOffset() * 60_000,
  );
  return localDate.toISOString().slice(0, 16);
}

export function toRomeDateInputValue(isoString: string): string {
  return ROME_DATE_FORMATTER.format(new Date(isoString));
}

function normalizeFundingLegs(
  legs: TransactionFundingLegFormValue[],
): TransactionFundingLegFormValue[] {
  return legs
    .map((leg) => ({
      accountId: leg.accountId.trim(),
      amount: leg.amount.trim(),
    }))
    .filter((leg) => leg.accountId || leg.amount);
}

function parsePostedAt(
  value: string,
  options: {
    showTransactionTimes: boolean;
    existingPostedAt?: string | null;
    now: Date;
  },
): string | null {
  if (!value.trim()) {
    return null;
  }

  if (!options.showTransactionTimes) {
    return parseRomeDateOnlyPostedAt(value, options);
  }

  const postedAt = new Date(value);
  if (Number.isNaN(postedAt.getTime())) {
    return null;
  }

  return postedAt.toISOString();
}

function parseNumber(value: string): number | null {
  if (!value.trim()) {
    return null;
  }

  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toString();
}

function parseRomeDateOnlyPostedAt(
  value: string,
  options: {
    existingPostedAt?: string | null;
    now: Date;
  },
): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  if (!year || !month || !day) {
    return null;
  }

  const sourceDate = options.existingPostedAt
    ? new Date(options.existingPostedAt)
    : options.now;
  const timeParts = getRomeDateTimeParts(sourceDate);
  return romeDateTimeToUtc(
    year,
    month,
    day,
    timeParts.hour,
    timeParts.minute,
    timeParts.second,
    timeParts.millisecond,
  ).toISOString();
}

function getRomeDateTimeParts(date: Date) {
  const parts = ROME_DATE_TIME_FORMATTER.formatToParts(date);
  return {
    hour: extractDateTimePart(parts, "hour"),
    minute: extractDateTimePart(parts, "minute"),
    second: extractDateTimePart(parts, "second"),
    millisecond: date.getUTCMilliseconds(),
  };
}

function extractDateTimePart(
  parts: Intl.DateTimeFormatPart[],
  type: Intl.DateTimeFormatPart["type"],
): number {
  const value = parts.find((part) => part.type === type)?.value;
  if (!value) {
    throw new Error(`Unable to extract ${type} for Europe/Rome conversion.`);
  }

  return Number(value);
}

function getRomeTimeZoneOffsetMs(date: Date): number {
  const parts = ROME_DATE_TIME_FORMATTER.formatToParts(date);
  const year = extractDateTimePart(parts, "year");
  const month = extractDateTimePart(parts, "month");
  const day = extractDateTimePart(parts, "day");
  const hour = extractDateTimePart(parts, "hour");
  const minute = extractDateTimePart(parts, "minute");
  const second = extractDateTimePart(parts, "second");

  return Date.UTC(year, month - 1, day, hour, minute, second) - date.getTime();
}

function romeDateTimeToUtc(
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
    const offset = getRomeTimeZoneOffsetMs(new Date(current));
    const next = targetUtc - offset;

    if (next === current) {
      break;
    }

    current = next;
  }

  return new Date(current);
}
