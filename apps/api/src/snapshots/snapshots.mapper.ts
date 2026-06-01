import type { NetWorthSnapshot, Prisma } from '@prisma/client';
import type {
  NetWorthSnapshotResponse,
  SnapshotCaptureResponse,
} from '@finhance/shared';

function decimalToNumber(
  value: Prisma.Decimal | null | undefined,
): number | null {
  return value ? value.toNumber() : null;
}

function serializeSnapshotDate(snapshotDate: Date): string {
  return snapshotDate.toISOString().slice(0, 10);
}

export function toNetWorthSnapshotResponse(
  snapshot: NetWorthSnapshot,
): NetWorthSnapshotResponse {
  return {
    id: snapshot.id,
    snapshotDate: serializeSnapshotDate(snapshot.snapshotDate),
    capturedAt: snapshot.capturedAt.toISOString(),
    baseCurrency: snapshot.baseCurrency,
    assetsTotal: decimalToNumber(snapshot.assetsTotal) ?? 0,
    liabilitiesTotal: decimalToNumber(snapshot.liabilitiesTotal) ?? 0,
    netWorthTotal: decimalToNumber(snapshot.netWorthTotal) ?? 0,
    unavailableCount: snapshot.unavailableCount,
    isPartial: snapshot.isPartial,
    createdAt: snapshot.createdAt.toISOString(),
    updatedAt: snapshot.updatedAt.toISOString(),
  };
}

export const toSnapshotCaptureResponse = toNetWorthSnapshotResponse as (
  snapshot: NetWorthSnapshot,
) => SnapshotCaptureResponse;
