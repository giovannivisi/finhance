import { AssetKind, AssetType, LiabilityKind } from '@prisma/client';

export const BASE_CURRENCY = 'EUR';
export const MARKET_KINDS = new Set<AssetKind>([
  AssetKind.STOCK,
  AssetKind.BOND,
  AssetKind.CRYPTO,
]);
export const VALUATION_STALE_MS = 1000 * 60 * 15;
export const REFRESH_COOLDOWN_MS = 1000 * 60;

export type ValuationSource =
  | 'LIVE'
  | 'LAST_QUOTE'
  | 'AVG_COST'
  | 'DIRECT_BALANCE'
  | 'UNAVAILABLE';

export interface DashboardAssetView {
  id: string;
  name: string;
  type: AssetType;
  kind: AssetKind | null;
  liabilityKind: LiabilityKind | null;
  ticker: string | null;
  exchange: string | null;
  quantity: number | null;
  unitPrice: number | null;
  balance: number;
  currency: string;
  notes: string | null;
  order: number | null;
  lastPrice: number | null;
  lastPriceAt: string | null;
  lastFxRate: number | null;
  lastFxRateAt: string | null;
  currentValue: number | null;
  referenceValue: number | null;
  valuationSource: ValuationSource;
  valuationAsOf: string | null;
  isStale: boolean;
}

export interface DashboardSummary {
  assets: number;
  liabilities: number;
  netWorth: number;
}

export interface DashboardResponse {
  baseCurrency: string;
  assets: DashboardAssetView[];
  summary: DashboardSummary;
  lastRefreshAt: string | null;
}

export interface RefreshAssetsResponse {
  refreshedAt: string;
  updatedCount: number;
  staleCount: number;
}
