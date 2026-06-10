const HIDDEN_AMOUNT = "•••••";

export interface FormatMoneyOptions {
  hide?: boolean;
  signDisplay?: "auto" | "always" | "never" | "exceptZero";
  maximumFractionDigits?: number;
  compact?: boolean;
}

const formatterCache = new Map<string, Intl.NumberFormat>();

function getFormatter(
  currency: string,
  options: FormatMoneyOptions,
): Intl.NumberFormat | null {
  const key = [
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
    const formatter = new Intl.NumberFormat("en-GB", {
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
    });
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
  const formatter = getFormatter(normalizedCurrency, options);

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
  const trimmed = raw.trim();

  if (!trimmed) {
    return null;
  }

  let normalized = trimmed.replace(/\s+/g, "");

  const lastComma = normalized.lastIndexOf(",");
  const lastDot = normalized.lastIndexOf(".");

  if (lastComma > -1 && lastDot > -1) {
    if (lastComma > lastDot) {
      normalized = normalized.replace(/\./g, "").replace(",", ".");
    } else {
      normalized = normalized.replace(/,/g, "");
    }
  } else if (lastComma > -1) {
    normalized = normalized.replace(",", ".");
  }

  if (!/^-?\d*(\.\d*)?$/.test(normalized)) {
    return null;
  }

  const value = Number(normalized);
  return Number.isFinite(value) ? value : null;
}

export { HIDDEN_AMOUNT };
