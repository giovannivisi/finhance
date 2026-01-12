export type ApiAsset = {
  id: string;
  name: string;
  balance: number;
  type: string;
  category?: { name: string } | null;
  kind?: string | null;
  ticker?: string | null;
  quantity?: number | null;
  unitPrice?: number | null;
  notes?: string | null;
  order?: number | null;
  liabilityKind?: string | null;
};

export const COLORS = {
  STOCK: "#4F46E5",
  CRYPTO: "#FACC15",
  CASH: "#22C55E",
  BOND: "#0EA5E9",
  REAL_ESTATE: "#F97316",
  COMMODITY: "#A16207",
  PENSION: "#6B7280",
  OTHER: "#4B5563"
} as const;

export const EXCHANGE_SUFFIXES = [
  { label: "🇺🇸 United States", value: "" },
  { label: "🇮🇹 Milan (BIT)", value: ".MI" },
  { label: "🇬🇧 London (LSE)", value: ".L" },
  { label: "🇩🇪 Xetra (DE)", value: ".DE" },
  { label: "🇫🇷 Paris (EPA)", value: ".PA" },
  { label: "🇪🇸 Madrid (BME)", value: ".MC" },
  { label: "Crypto", value: "_CRYPTO_" }
];

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
} as const;

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
} as const;