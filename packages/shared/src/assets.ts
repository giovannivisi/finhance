export type AssetType = "ASSET" | "LIABILITY";

export type AssetKind =
  | "CASH"
  | "STOCK"
  | "BOND"
  | "CRYPTO"
  | "REAL_ESTATE"
  | "PENSION"
  | "COMMODITY"
  | "OTHER";

export type LiabilityKind = "TAX" | "DEBT" | "OTHER";

export type ValuationSource =
  | "LIVE"
  | "LAST_QUOTE"
  | "AVG_COST"
  | "DIRECT_BALANCE"
  | "UNAVAILABLE";

export interface UpsertAssetRequest {
  name: string;
  type: AssetType;
  accountId?: string | null;
  currency?: string;
  ticker?: string | null;
  exchange?: string | null;
  quantity?: number | null;
  unitPrice?: number | null;
  balance?: number | null;
  kind?: AssetKind | null;
  liabilityKind?: LiabilityKind | null;
  notes?: string | null;
  order?: number | null;
}

export interface AssetResponse {
  id: string;
  name: string;
  type: AssetType;
  accountId: string | null;
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
}

export interface DashboardAssetResponse extends AssetResponse {
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
  assets: DashboardAssetResponse[];
  summary: DashboardSummary;
  lastRefreshAt: string | null;
  latestSnapshotDate: string | null;
  latestSnapshotCapturedAt: string | null;
  latestSnapshotIsPartial: boolean | null;
}

export interface RefreshAssetsResponse {
  refreshedAt: string;
  updatedCount: number;
  staleCount: number;
}
