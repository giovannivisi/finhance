import { AssetKind } from '@finhance/db';

const DISPLAY_NAMES = new Intl.DisplayNames(['en'], { type: 'currency' });
const FALLBACK_CURRENCY_CODES = ['EUR', 'USD', 'GBP', 'CHF'] as const;

export const SUPPORTED_REPORTING_CURRENCY_CODES = [
  'EUR',
  'USD',
  'GBP',
  'CHF',
] as const;

const MARKET_KINDS: readonly AssetKind[] = [AssetKind.STOCK, AssetKind.BOND];
const CRYPTO_ONLY: readonly AssetKind[] = [AssetKind.CRYPTO];

const SUPPORTED_EXCHANGES: ReadonlyArray<{
  value: string;
  allowedKinds: readonly AssetKind[];
}> = [
  { value: '', allowedKinds: MARKET_KINDS },
  { value: '.TO', allowedKinds: MARKET_KINDS },
  { value: '.V', allowedKinds: MARKET_KINDS },
  { value: '.MX', allowedKinds: MARKET_KINDS },
  { value: '.SA', allowedKinds: MARKET_KINDS },
  { value: '.BA', allowedKinds: MARKET_KINDS },
  { value: '.L', allowedKinds: MARKET_KINDS },
  { value: '.IR', allowedKinds: MARKET_KINDS },
  { value: '.DE', allowedKinds: MARKET_KINDS },
  { value: '.F', allowedKinds: MARKET_KINDS },
  { value: '.HM', allowedKinds: MARKET_KINDS },
  { value: '.DU', allowedKinds: MARKET_KINDS },
  { value: '.MU', allowedKinds: MARKET_KINDS },
  { value: '.BE', allowedKinds: MARKET_KINDS },
  { value: '.SG', allowedKinds: MARKET_KINDS },
  { value: '.SW', allowedKinds: MARKET_KINDS },
  { value: '.VI', allowedKinds: MARKET_KINDS },
  { value: '.AS', allowedKinds: MARKET_KINDS },
  { value: '.BR', allowedKinds: MARKET_KINDS },
  { value: '.PA', allowedKinds: MARKET_KINDS },
  { value: '.MC', allowedKinds: MARKET_KINDS },
  { value: '.LS', allowedKinds: MARKET_KINDS },
  { value: '.MI', allowedKinds: MARKET_KINDS },
  { value: '.ST', allowedKinds: MARKET_KINDS },
  { value: '.OL', allowedKinds: MARKET_KINDS },
  { value: '.CO', allowedKinds: MARKET_KINDS },
  { value: '.HE', allowedKinds: MARKET_KINDS },
  { value: '.WA', allowedKinds: MARKET_KINDS },
  { value: '.PR', allowedKinds: MARKET_KINDS },
  { value: '.AT', allowedKinds: MARKET_KINDS },
  { value: '.IS', allowedKinds: MARKET_KINDS },
  { value: '.JO', allowedKinds: MARKET_KINDS },
  { value: '.TA', allowedKinds: MARKET_KINDS },
  { value: '.BO', allowedKinds: MARKET_KINDS },
  { value: '.NS', allowedKinds: MARKET_KINDS },
  { value: '.T', allowedKinds: MARKET_KINDS },
  { value: '.KS', allowedKinds: MARKET_KINDS },
  { value: '.KQ', allowedKinds: MARKET_KINDS },
  { value: '.HK', allowedKinds: MARKET_KINDS },
  { value: '.SS', allowedKinds: MARKET_KINDS },
  { value: '.SZ', allowedKinds: MARKET_KINDS },
  { value: '.TW', allowedKinds: MARKET_KINDS },
  { value: '.SI', allowedKinds: MARKET_KINDS },
  { value: '.BK', allowedKinds: MARKET_KINDS },
  { value: '.KL', allowedKinds: MARKET_KINDS },
  { value: '.JK', allowedKinds: MARKET_KINDS },
  { value: '.PS', allowedKinds: MARKET_KINDS },
  { value: '.AX', allowedKinds: MARKET_KINDS },
  { value: '.NZ', allowedKinds: MARKET_KINDS },
  { value: '_CRYPTO_', allowedKinds: CRYPTO_ONLY },
];

function getRuntimeCurrencyCodes(): string[] {
  try {
    if (typeof Intl.supportedValuesOf === 'function') {
      const codes = Intl.supportedValuesOf('currency').filter((value) =>
        /^[A-Z]{3}$/.test(value),
      );

      if (codes.length > 0) {
        return codes;
      }
    }
  } catch {
    // Fall through to the safe fallback set below.
  }

  return [...FALLBACK_CURRENCY_CODES];
}

export function isSupportedCurrencyCode(
  value: string | null | undefined,
): value is string {
  const normalized = value?.trim().toUpperCase() ?? '';
  if (!normalized) {
    return false;
  }

  return getRuntimeCurrencyCodes().includes(normalized);
}

export function isSupportedReportingCurrencyCode(
  value: string | null | undefined,
): boolean {
  const normalized = value?.trim().toUpperCase() ?? '';
  return (SUPPORTED_REPORTING_CURRENCY_CODES as readonly string[]).includes(
    normalized,
  );
}

export function isSupportedExchangeValue(
  value: string | null | undefined,
  kind?: AssetKind | null,
): boolean {
  const normalized = (value ?? '').trim().toUpperCase();

  return SUPPORTED_EXCHANGES.some(
    (exchange) =>
      exchange.value === normalized &&
      (!kind ||
        exchange.allowedKinds.some((allowedKind) => allowedKind === kind)),
  );
}

export function getCurrencyDisplayName(code: string): string {
  return DISPLAY_NAMES.of(code) ?? code;
}
