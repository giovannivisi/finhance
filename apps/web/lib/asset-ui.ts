import type { AssetKind, LiabilityKind } from "@finhance/shared";
import { getExchangePickerOptionsForKind } from "@lib/currency-ui";

export interface KindConfig {
  showBalance: boolean;
  showTicker: boolean;
  showQuantity: boolean;
  showUnitPrice: boolean;
}

export const COLORS = {
  STOCK: "#4F46E5",
  CRYPTO: "#FACC15",
  CASH: "#22C55E",
  BOND: "#0EA5E9",
  REAL_ESTATE: "#F97316",
  COMMODITY: "#A16207",
  PENSION: "#6B7280",
  OTHER: "#4B5563",
} as const satisfies Record<AssetKind, string>;

export function getExchangeSuffixesForKind(kind: AssetKind) {
  return getExchangePickerOptionsForKind(kind);
}

export const ASSET_KIND_OPTIONS: AssetKind[] = [
  "CASH",
  "STOCK",
  "BOND",
  "CRYPTO",
  "REAL_ESTATE",
  "PENSION",
  "COMMODITY",
  "OTHER",
];

export const LIABILITY_KIND_OPTIONS: LiabilityKind[] = ["TAX", "DEBT", "OTHER"];

export const ASSET_KIND_CONFIG = {
  CASH: {
    showBalance: true,
    showTicker: false,
    showQuantity: false,
    showUnitPrice: false,
  },
  STOCK: {
    showBalance: false,
    showTicker: true,
    showQuantity: true,
    showUnitPrice: true,
  },
  BOND: {
    showBalance: false,
    showTicker: true,
    showQuantity: true,
    showUnitPrice: true,
  },
  CRYPTO: {
    showBalance: false,
    showTicker: true,
    showQuantity: true,
    showUnitPrice: true,
  },
  REAL_ESTATE: {
    showBalance: true,
    showTicker: false,
    showQuantity: false,
    showUnitPrice: false,
  },
  PENSION: {
    showBalance: true,
    showTicker: false,
    showQuantity: false,
    showUnitPrice: false,
  },
  COMMODITY: {
    showBalance: true,
    showTicker: false,
    showQuantity: false,
    showUnitPrice: false,
  },
  OTHER: {
    showBalance: true,
    showTicker: false,
    showQuantity: false,
    showUnitPrice: false,
  },
} as const satisfies Record<AssetKind, KindConfig>;

const KIND_DISPLAY_NAMES: Record<string, string> = {
  CASH: "Cash",
  STOCK: "Stock",
  BOND: "Bond",
  CRYPTO: "Crypto",
  REAL_ESTATE: "Real Estate",
  PENSION: "Pension",
  COMMODITY: "Commodity",
  OTHER: "Other",
  TAX: "Tax",
  DEBT: "Debt",
};

export function formatKindLabel(kind: string): string {
  return KIND_DISPLAY_NAMES[kind] ?? kind.replace(/_/g, " ");
}

export const LIABILITY_CONFIG = {
  TAX: {
    showBalance: true,
    showTicker: false,
    showQuantity: false,
    showUnitPrice: false,
  },
  DEBT: {
    showBalance: true,
    showTicker: false,
    showQuantity: false,
    showUnitPrice: false,
  },
  OTHER: {
    showBalance: true,
    showTicker: false,
    showQuantity: false,
    showUnitPrice: false,
  },
} as const satisfies Record<LiabilityKind, KindConfig>;
