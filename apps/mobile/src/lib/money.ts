import { getFormatConfig } from "./format-config";

const HIDDEN_AMOUNT = "•••••";

export interface FormatMoneyOptions {
  hide?: boolean;
  signDisplay?: "auto" | "always" | "never" | "exceptZero";
  maximumFractionDigits?: number;
  compact?: boolean;
  locale?: string;
}

const formatterCache = new Map<string, Intl.NumberFormat>();

function getFormatter(
  currency: string,
  options: FormatMoneyOptions,
): Intl.NumberFormat | null {
  const key = [
    options.locale ?? getFormatConfig().locale,
    currency,
    options.signDisplay ?? "auto",
    options.maximumFractionDigits ?? "",
    options.compact ? "compact" : "standard",
  ].join("|");

  const cached = formatterCache.get(key);

  if (cached) {
    return cached;
  }

  try {
    const formatter = new Intl.NumberFormat(
      options.locale ?? getFormatConfig().locale,
      {
        localeMatcher: "best fit",
        style: "currency",
        currency,
        currencyDisplay: "narrowSymbol",
        signDisplay: options.signDisplay ?? "auto",
        notation: options.compact ? "compact" : "standard",
        ...(options.maximumFractionDigits !== undefined
          ? {
              maximumFractionDigits: options.maximumFractionDigits,
              minimumFractionDigits: 0,
            }
          : {}),
      },
    );
    formatterCache.set(key, formatter);
    return formatter;
  } catch {
    return null;
  }
}

export function formatMoney(
  amount: number,
  currency: string,
  options: FormatMoneyOptions = {},
): string {
  if (options.hide) {
    return HIDDEN_AMOUNT;
  }

  if (!Number.isFinite(amount)) {
    return "—";
  }

  const normalizedCurrency = currency?.trim().toUpperCase() || "EUR";
  const formatter = getFormatter(normalizedCurrency, {
    ...options,
    locale: options.locale ?? getFormatConfig().locale,
  });

  if (!formatter) {
    const sign =
      options.signDisplay === "always" && amount > 0
        ? "+"
        : options.signDisplay === "never" && amount < 0
          ? ""
          : amount < 0
            ? "-"
            : "";
    const absolute = Math.abs(amount).toFixed(2);
    return `${sign}${absolute} ${normalizedCurrency}`;
  }

  const value = options.signDisplay === "never" ? Math.abs(amount) : amount;
  return formatter.format(value);
}

export function formatSignedMoney(
  amount: number,
  currency: string,
  options: Omit<FormatMoneyOptions, "signDisplay"> = {},
): string {
  return formatMoney(amount, currency, {
    ...options,
    signDisplay: "exceptZero",
  });
}

/**
 * Parses a user-typed decimal amount. Accepts both "," and "." as the decimal
 * separator and ignores spaces and thousands separators that do not look like
 * a decimal part.
 */
export function parseAmountInput(raw: string): number | null {
  const compact = raw.trim().replace(/\s+/g, "");

  if (!compact) {
    return null;
  }

  let normalized: string;

  if (compact.includes(",") && compact.includes(".")) {
    // Mixed separators: the rightmost one is the decimal mark, the other must
    // form valid groups of three.
    if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(compact)) {
      normalized = compact.replace(/\./g, "").replace(",", ".");
    } else if (/^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(compact)) {
      normalized = compact.replace(/,/g, "");
    } else {
      return null;
    }
  } else if (compact.includes(",")) {
    if (/^-?\d{1,3}(,\d{3})+$/.test(compact)) {
      normalized = compact.replace(/,/g, "");
    } else if (/^-?\d*,\d*$/.test(compact)) {
      normalized = compact.replace(",", ".");
    } else {
      return null;
    }
  } else if (compact.includes(".")) {
    if (/^-?\d{1,3}(\.\d{3}){2,}$/.test(compact)) {
      // Repeated dot groups can only be thousands separators.
      normalized = compact.replace(/\./g, "");
    } else if (/^-?\d*\.\d*$/.test(compact)) {
      normalized = compact;
    } else {
      return null;
    }
  } else {
    normalized = compact;
  }

  if (!/^-?\d+(\.\d+)?$/.test(normalized) && !/^-?\d+\.$/.test(normalized)) {
    return null;
  }

  const value = Number(normalized);
  return Number.isFinite(value) ? value : null;
}

export { HIDDEN_AMOUNT };
