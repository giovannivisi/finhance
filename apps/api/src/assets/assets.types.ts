import { AssetKind } from '@finhance/db';

export const DEFAULT_REPORTING_CURRENCY = 'EUR';
export const MARKET_KINDS = new Set<AssetKind>([
  AssetKind.STOCK,
  AssetKind.BOND,
  AssetKind.CRYPTO,
]);
export const VALUATION_STALE_MS = 1000 * 60 * 15;
export const REFRESH_COOLDOWN_MS = 1000 * 60;
