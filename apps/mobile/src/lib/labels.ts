import type {
  AccountType,
  AssetKind,
  BudgetUsageStatus,
  CategoryType,
  LiabilityKind,
  TransactionKind,
  ValuationSource,
} from "@finhance/shared";

export const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  BANK: "Bank",
  BROKER: "Broker",
  CARD: "Card",
  CASH: "Cash",
  LOAN: "Loan",
  OTHER: "Other",
};

export const ASSET_KIND_LABELS: Record<AssetKind, string> = {
  CASH: "Cash",
  STOCK: "Stocks",
  BOND: "Bonds",
  CRYPTO: "Crypto",
  REAL_ESTATE: "Real estate",
  PENSION: "Pension",
  COMMODITY: "Commodities",
  OTHER: "Other",
};

export const LIABILITY_KIND_LABELS: Record<LiabilityKind, string> = {
  DEBT: "Debt",
  TAX: "Tax",
  OTHER: "Other",
};

export const TRANSACTION_KIND_LABELS: Record<TransactionKind, string> = {
  EXPENSE: "Expense",
  INCOME: "Income",
  TRANSFER: "Transfer",
  ADJUSTMENT: "Adjustment",
};

export const CATEGORY_TYPE_LABELS: Record<CategoryType, string> = {
  EXPENSE: "Expense",
  INCOME: "Income",
};

export const VALUATION_SOURCE_LABELS: Record<ValuationSource, string> = {
  LIVE: "Live price",
  LAST_QUOTE: "Last quote",
  AVG_COST: "Average cost",
  DIRECT_BALANCE: "Balance",
  UNAVAILABLE: "Unavailable",
};

export const BUDGET_STATUS_LABELS: Record<BudgetUsageStatus, string> = {
  WITHIN_BUDGET: "On track",
  AT_LIMIT: "At limit",
  OVER_BUDGET: "Over budget",
};

export function assetKindLabel(kind: AssetKind | null): string {
  return kind ? ASSET_KIND_LABELS[kind] : "Unassigned";
}

export function liabilityKindLabel(kind: LiabilityKind | null): string {
  return kind ? LIABILITY_KIND_LABELS[kind] : "Unassigned";
}
