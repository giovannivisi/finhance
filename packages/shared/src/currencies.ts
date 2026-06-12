const FALLBACK_CURRENCY_CODES = ["EUR", "USD", "GBP", "CHF"] as const;

// Intl.DisplayNames is unavailable in some runtimes (e.g. Hermes on React
// Native), so construct it lazily and fall back to bare currency codes.
function createCurrencyDisplayNames(): Intl.DisplayNames | null {
  try {
    return new Intl.DisplayNames(["en"], { type: "currency" });
  } catch {
    return null;
  }
}

export const SUPPORTED_REPORTING_CURRENCY_CODES = [
  "EUR",
  "USD",
  "GBP",
  "CHF",
] as const;

export type SupportedReportingCurrencyCode =
  (typeof SUPPORTED_REPORTING_CURRENCY_CODES)[number];

export interface CurrencyDefinition {
  code: string;
  name: string;
  label: string;
  searchText: string;
}

let cachedCurrencyDefinitions: CurrencyDefinition[] | null = null;
let cachedCurrencyCodeSet: Set<string> | null = null;

function getRuntimeCurrencyCodes(): string[] {
  try {
    const supportedValuesOf = Intl.supportedValuesOf;
    if (typeof supportedValuesOf === "function") {
      const codes = supportedValuesOf("currency").filter((value) =>
        /^[A-Z]{3}$/.test(value),
      );

      if (codes.length > 0) {
        return codes;
      }
    }
  } catch {
    // Fall back to a small safe set below.
  }

  return [...FALLBACK_CURRENCY_CODES];
}

function buildCurrencyDefinitions(): CurrencyDefinition[] {
  const displayNames = createCurrencyDisplayNames();

  return getRuntimeCurrencyCodes()
    .map((code) => {
      let name = code;

      try {
        name = displayNames?.of(code) ?? code;
      } catch {
        // Keep the bare code when the runtime rejects it.
      }
      return {
        code,
        name,
        label: `${name} (${code})`,
        searchText: `${code} ${name}`.toLowerCase(),
      };
    })
    .sort((left, right) => {
      if (left.name === right.name) {
        return left.code.localeCompare(right.code);
      }

      return left.name.localeCompare(right.name);
    });
}

export function getSupportedCurrencyDefinitions(): CurrencyDefinition[] {
  cachedCurrencyDefinitions ??= buildCurrencyDefinitions();
  return cachedCurrencyDefinitions;
}

export function getSupportedCurrencyCodes(): string[] {
  return getSupportedCurrencyDefinitions().map((definition) => definition.code);
}

export function getCurrencyDefinition(
  value: string | null | undefined,
): CurrencyDefinition | null {
  const code = value?.trim().toUpperCase() ?? "";
  if (!code) {
    return null;
  }

  return (
    getSupportedCurrencyDefinitions().find(
      (definition) => definition.code === code,
    ) ?? null
  );
}

export function isSupportedCurrencyCode(
  value: string | null | undefined,
): value is string {
  const code = value?.trim().toUpperCase() ?? "";
  if (!code) {
    return false;
  }

  cachedCurrencyCodeSet ??= new Set(getSupportedCurrencyCodes());
  return cachedCurrencyCodeSet.has(code);
}

export function isSupportedReportingCurrencyCode(
  value: string | null | undefined,
): value is SupportedReportingCurrencyCode {
  const code = value?.trim().toUpperCase() ?? "";
  return (SUPPORTED_REPORTING_CURRENCY_CODES as readonly string[]).includes(
    code,
  );
}

export function normalizeSupportedCurrencyCode(
  value: string | null | undefined,
): string | null {
  const code = value?.trim().toUpperCase() ?? "";
  return isSupportedCurrencyCode(code) ? code : null;
}
