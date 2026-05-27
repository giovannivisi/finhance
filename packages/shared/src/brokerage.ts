import type {
  AccountReconciliationResponse,
  AccountResponse,
} from "./accounts.js";
import type {
  AssetKind,
  AggregatePricingStatus,
  DashboardAssetResponse,
  ValuationSource,
} from "./assets.js";
import type { CategoryResponse, TransactionResponse } from "./transactions.js";

export type BrokerageOperationKind = "BUY" | "SELL" | "DIVIDEND" | "FEE";

export interface BrokerageAccountSummaryResponse {
  account: AccountResponse;
  totalValue: number;
  cashAvailable: number;
  investedValue: number;
  unrealisedGainLoss: number;
  activePositionCount: number;
}

export interface BrokeragePositionResponse {
  assetId: string;
  name: string;
  kind: AssetKind;
  ticker: string | null;
  exchange: string | null;
  currency: string;
  quantity: number;
  averageCostPerUnit: number;
  costBasis: number;
  currentPrice: number | null;
  currentValue: number | null;
  unrealisedGainLoss: number | null;
  percentOfBrokerage: number | null;
  percentOfPortfolio: number | null;
  targetPercent: number | null;
  deltaPercent: number | null;
  deltaValue: number | null;
  valuationSource: ValuationSource;
  valuationAsOf: string | null;
  isStale: boolean;
}

export type BrokerageActivitySource = "BROKERAGE_OPERATION" | "TRANSACTION";

export interface BrokerageActivityItemResponse {
  id: string;
  source: BrokerageActivitySource;
  kind: string;
  postedAt: string;
  title: string;
  detail: string | null;
  amount: number;
  currency: string;
  notes: string | null;
  assetId: string | null;
  assetName: string | null;
  quantity: number | null;
  unitPrice: number | null;
  feeAmount: number | null;
  transactionId: string | null;
}

export interface PortfolioAllocationSnapshotItemResponse {
  key: string;
  label: string;
  kind: AssetKind;
  ticker: string | null;
  exchange: string | null;
  currentValue: number;
  currentPercent: number | null;
  targetPercent: number | null;
  deltaPercent: number | null;
  deltaValue: number | null;
}

export interface PortfolioAllocationSnapshotResponse {
  assetKindTargets: PortfolioAllocationSnapshotItemResponse[];
  securityTargets: PortfolioAllocationSnapshotItemResponse[];
}

export interface BrokerageWorkspaceResponse {
  reportingCurrency: string;
  baseCurrency?: string;
  pricingStatus: AggregatePricingStatus;
  brokers: BrokerageAccountSummaryResponse[];
  selectedBroker: BrokerageAccountSummaryResponse;
  cashReconciliation: AccountReconciliationResponse | null;
  positions: BrokeragePositionResponse[];
  activity: BrokerageActivityItemResponse[];
  allocation: PortfolioAllocationSnapshotResponse;
}

export interface PortfolioAssetKindTargetInput {
  kind: AssetKind;
  targetPercent: number;
}

export interface PortfolioSecurityTargetInput {
  kind: AssetKind;
  ticker: string;
  exchange?: string | null;
  name?: string | null;
  targetPercent: number;
}

export interface UpdatePortfolioAllocationTargetsRequest {
  assetKindTargets: PortfolioAssetKindTargetInput[];
  securityTargets: PortfolioSecurityTargetInput[];
}

export interface PortfolioAllocationTargetsResponse {
  assetKindTargets: PortfolioAssetKindTargetInput[];
  securityTargets: PortfolioSecurityTargetInput[];
}

export interface CreateBrokerageBuyRequest {
  assetId?: string | null;
  name?: string | null;
  kind: AssetKind;
  ticker?: string | null;
  exchange?: string | null;
  currency: string;
  quantity: number;
  unitPrice: number;
  feeAmount?: number | null;
  postedAt: string;
  notes?: string | null;
}

export interface CreateBrokerageSellRequest {
  assetId: string;
  quantity: number;
  unitPrice: number;
  feeAmount?: number | null;
  postedAt: string;
  notes?: string | null;
}

export interface CreateBrokerageDividendRequest {
  assetId?: string | null;
  amount: number;
  postedAt: string;
  categoryId: string;
  notes?: string | null;
}

export interface CreateBrokerageFeeRequest {
  assetId?: string | null;
  amount: number;
  postedAt: string;
  categoryId: string;
  notes?: string | null;
}

export interface BrokerageOperationResponse {
  id: string;
  kind: BrokerageOperationKind;
  accountId: string;
  assetId: string | null;
  postedAt: string;
  currency: string;
  quantity: number | null;
  unitPrice: number | null;
  grossAmount: number | null;
  feeAmount: number | null;
  cashAmount: number;
  realisedGainLoss: number | null;
  notes: string | null;
  mirroredTransactionId: string | null;
}

export interface BrokeragePageBootstrapResponse {
  workspace: BrokerageWorkspaceResponse;
  categories: CategoryResponse[];
  recentTransactions: TransactionResponse[];
  positionsWithValues: DashboardAssetResponse[];
}
