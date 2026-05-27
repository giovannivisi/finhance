import type { AccountResponse, AccountType } from "./accounts.js";
import type { MonthlyBudgetResponse } from "./budgets.js";
import type { SetupStatusResponse } from "./setup.js";

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
  accountName: string | null;
  accountType: AccountType | null;
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

export type AggregatePricingState = "FRESH" | "STALE" | "PARTIAL";

export interface AggregatePricingStatus {
  state: AggregatePricingState;
  refreshSuggested: boolean;
  hasStaleQuotes: boolean;
  hasStaleFx: boolean;
  hasMissingFx: boolean;
}

export interface DashboardResponse {
  reportingCurrency: string;
  baseCurrency?: string;
  assets: DashboardAssetResponse[];
  summary: DashboardSummary;
  pricingStatus: AggregatePricingStatus;
  assetKindOrder: string[];
  lastRefreshAt: string | null;
  latestSnapshotDate: string | null;
  latestSnapshotCapturedAt: string | null;
  latestSnapshotIsPartial: boolean | null;
}

export interface DashboardPageDataResponse {
  dashboard: DashboardResponse;
  budgetView: MonthlyBudgetResponse;
  accounts: AccountResponse[];
  setup: SetupStatusResponse | null;
}

export interface DashboardSupportDataResponse {
  budgetView: MonthlyBudgetResponse;
  setup: SetupStatusResponse | null;
}

export interface ReorderAssetsRequest {
  assetIds: string[];
}

export interface ReorderAssetKindsRequest {
  kindOrder: string[];
}

export interface RefreshAssetsResponse {
  refreshedAt: string;
  updatedCount: number;
  staleCount: number;
}
