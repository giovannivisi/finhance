import { formatCurrency } from "./format";

export const HIDDEN_MONEY_VALUE = "••••";

export function formatSensitiveCurrency(
  value: number | null | undefined,
  currency = "EUR",
  hidden = false,
  fallback = "Unavailable",
): string {
  if (value == null) {
    return fallback;
  }

  return hidden ? HIDDEN_MONEY_VALUE : formatCurrency(value, currency);
}

export function formatSensitiveNumber(
  value: number | null | undefined,
  hidden = false,
  fallback = "Unavailable",
): string {
  if (value == null) {
    return fallback;
  }

  return hidden ? HIDDEN_MONEY_VALUE : String(value);
}
