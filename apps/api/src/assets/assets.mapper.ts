import type { AssetResponse } from '@finhance/shared';
import type { Asset, Prisma } from '@prisma/client';

function decimalToNumber(
  value: Prisma.Decimal | null | undefined,
): number | null {
  return value ? value.toNumber() : null;
}

export function toAssetResponse(asset: Asset): AssetResponse {
  return {
    id: asset.id,
    name: asset.name,
    type: asset.type,
    kind: asset.kind,
    liabilityKind: asset.liabilityKind,
    ticker: asset.ticker,
    exchange: asset.exchange,
    quantity: decimalToNumber(asset.quantity),
    unitPrice: decimalToNumber(asset.unitPrice),
    balance: decimalToNumber(asset.balance) ?? 0,
    currency: asset.currency,
    notes: asset.notes,
    order: asset.order,
    lastPrice: decimalToNumber(asset.lastPrice),
    lastPriceAt: asset.lastPriceAt?.toISOString() ?? null,
    lastFxRate: decimalToNumber(asset.lastFxRate),
    lastFxRateAt: asset.lastFxRateAt?.toISOString() ?? null,
  };
}
