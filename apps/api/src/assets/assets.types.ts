import { AssetKind } from '@finhance/db';

export const DEFAULT_REPORTING_CURRENCY = 'EUR';
export const MARKET_KINDS = new Set<AssetKind>([
  AssetKind.STOCK,
  AssetKind.BOND,
  AssetKind.CRYPTO,
]);
export const VALUATION_STALE_MS = 1000 * 60 * 15;
export const REFRESH_COOLDOWN_MS = 1000 * 60;
/**
 * Hard cap beyond which a stored quote is always treated as stale, regardless
 * of whether its venue is currently closed. Sized to comfortably cover the
 * longest realistic market closure (a long holiday weekend) so a price captured
 * just before such a break is not falsely flagged, while a quote we have failed
 * to refresh for days still surfaces as stale.
 */
export const MAX_QUOTE_AGE_MS = 1000 * 60 * 60 * 24 * 5;
