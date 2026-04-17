import type { AssetKind, LiabilityKind } from "@finhance/shared";

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

export const EXCHANGE_SUFFIXES = [
  { label: "🇺🇸 United States", value: "" },
  { label: "🇮🇹 Milan (BIT)", value: ".MI" },
  { label: "🇬🇧 London (LSE)", value: ".L" },
  { label: "🇩🇪 Xetra (DE)", value: ".DE" },
  { label: "🇫🇷 Paris (EPA)", value: ".PA" },
  { label: "🇪🇸 Madrid (BME)", value: ".MC" },
  { label: "Crypto", value: "_CRYPTO_" },
] as const;

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
