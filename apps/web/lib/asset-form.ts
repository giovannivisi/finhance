import { ASSET_KIND_CONFIG, LIABILITY_CONFIG } from "@lib/asset-ui";
import type {
  AssetKind,
  AssetResponse,
  AssetType,
  LiabilityKind,
  UpsertAssetRequest,
} from "@finhance/shared";

export interface AssetFormValues {
  name: string;
  type: AssetType;
  kind: AssetKind | LiabilityKind;
  accountId: string;
  balance: string;
  currency: string;
  ticker: string;
  exchange: string;
  quantity: string;
  unitPrice: string;
  notes: string;
  order: string;
}

const DEFAULT_ASSET_KIND: AssetKind = "CASH";
const DEFAULT_LIABILITY_KIND: LiabilityKind = "TAX";

export function getDefaultKindForType(
  type: AssetType,
): AssetKind | LiabilityKind {
  return type === "LIABILITY" ? DEFAULT_LIABILITY_KIND : DEFAULT_ASSET_KIND;
}

export function ensureKindForType(
  type: AssetType,
  kind: AssetKind | LiabilityKind,
): AssetKind | LiabilityKind {
  if (type === "LIABILITY") {
    return kind in LIABILITY_CONFIG ? kind : DEFAULT_LIABILITY_KIND;
  }

  return kind in ASSET_KIND_CONFIG ? kind : DEFAULT_ASSET_KIND;
}

export function normalizeTickerInput(value: string): string {
  return value.trim().toUpperCase();
}

export function normalizeCurrencyInput(value: string): string {
  return value.trim().toUpperCase() || "EUR";
}

export function normalizeExchangeInput(
  type: AssetType,
  kind: AssetKind | LiabilityKind,
  value: string,
): string {
  const normalized = value.trim().toUpperCase();

  if (type !== "ASSET") {
    return "";
  }

  if (kind === "CRYPTO") {
    return "_CRYPTO_";
  }

  return normalized === "_CRYPTO_" ? "" : normalized;
}

export function getKindConfig(
  type: AssetType,
  kind: AssetKind | LiabilityKind,
) {
  const safeKind = ensureKindForType(type, kind);

  if (type === "LIABILITY") {
    return LIABILITY_CONFIG[safeKind as keyof typeof LIABILITY_CONFIG];
  }

  return ASSET_KIND_CONFIG[safeKind as keyof typeof ASSET_KIND_CONFIG];
}

export function buildAssetPayload(values: AssetFormValues): {
  payload?: UpsertAssetRequest;
  error?: string;
} {
  const type = values.type;
  const kind = ensureKindForType(type, values.kind);
  const config = getKindConfig(type, kind);
  const currency = normalizeCurrencyInput(values.currency);
  const ticker = normalizeTickerInput(values.ticker);
  const exchange = normalizeExchangeInput(type, kind, values.exchange);
  const quantity = parseNumber(values.quantity);
  const unitPrice = parseNumber(values.unitPrice);
  const balance = parseNumber(values.balance);
  const order = parseNumber(values.order);

  if (!values.name.trim()) {
    return { error: "Name is required." };
  }

  if (type === "LIABILITY") {
    const liabilityKind = kind as LiabilityKind;

    if (balance === null) {
      return { error: "Please enter an amount for the liability." };
    }

    return {
      payload: {
        name: values.name.trim(),
        type,
        accountId: values.accountId.trim() || null,
        currency,
        ticker: null,
        exchange: null,
        quantity: null,
        unitPrice: null,
        balance,
        kind: null,
        liabilityKind,
        notes: values.notes.trim() || null,
        order,
      },
    };
  }

  const assetKind = kind as AssetKind;

  if (config.showTicker && !ticker) {
    return { error: "Please enter a ticker." };
  }

  if (config.showQuantity && quantity === null) {
    return { error: "Please enter a quantity." };
  }

  if (config.showUnitPrice && unitPrice === null) {
    return { error: "Please enter a unit price." };
  }

  if (config.showBalance && balance === null) {
    return { error: "Please enter an amount." };
  }

  const computedBalance = config.showBalance
    ? balance
    : quantity !== null && unitPrice !== null
      ? quantity * unitPrice
      : null;

  if (computedBalance === null) {
    return {
      error:
        "The selected asset requires either an amount or a quantity and unit price.",
    };
  }

  return {
    payload: {
      name: values.name.trim(),
      type,
      accountId: values.accountId.trim() || null,
      currency,
      ticker: config.showTicker ? ticker : null,
      exchange: config.showTicker ? exchange : null,
      quantity: config.showQuantity ? quantity : null,
      unitPrice: config.showUnitPrice ? unitPrice : null,
      balance: computedBalance,
      kind: assetKind,
      liabilityKind: null,
      notes: values.notes.trim() || null,
      order,
    },
  };
}

export function assetToFormValues(asset: AssetResponse): AssetFormValues {
  return {
    name: asset.name,
    type: asset.type,
    kind:
      asset.type === "LIABILITY"
        ? (asset.liabilityKind ?? DEFAULT_LIABILITY_KIND)
        : (asset.kind ?? DEFAULT_ASSET_KIND),
    accountId: asset.accountId ?? "",
    balance: toInputString(asset.balance),
    currency: asset.currency ?? "EUR",
    ticker: asset.ticker ?? "",
    exchange: asset.exchange ?? "",
    quantity: toInputString(asset.quantity),
    unitPrice: toInputString(asset.unitPrice),
    notes: asset.notes ?? "",
    order: asset.order != null ? String(asset.order) : "",
  };
}

export function createEmptyAssetFormValues(): AssetFormValues {
  return {
    name: "",
    type: "ASSET",
    kind: DEFAULT_ASSET_KIND,
    accountId: "",
    balance: "",
    currency: "EUR",
    ticker: "",
    exchange: "",
    quantity: "",
    unitPrice: "",
    notes: "",
    order: "",
  };
}

function parseNumber(value: string): number | null {
  if (!value.trim()) {
    return null;
  }

  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function toInputString(value: string | number | null | undefined): string {
  if (value === null || value === undefined) {
    return "";
  }

  return String(value);
}
