import { Prisma } from '@finhance/db';
import { toNetWorthSnapshotResponse } from '@snapshots/snapshots.mapper';

const OWNER_ID = 'local-dev';

function createSnapshot(overrides: Partial<Record<string, unknown>> = {}) {
  const now = new Date('2026-04-17T10:00:00.000Z');

  return {
    id: 'snapshot-1',
    userId: OWNER_ID,
    snapshotDate: new Date('2026-04-17T00:00:00.000Z'),
    capturedAt: now,
    baseCurrency: 'EUR',
    assetsTotal: new Prisma.Decimal('100'),
    liabilitiesTotal: new Prisma.Decimal('25'),
    netWorthTotal: new Prisma.Decimal('75'),
    nativeAssetTotals: null,
    nativeLiabilityTotals: null,
    unavailableCount: 0,
    isPartial: false,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe('toNetWorthSnapshotResponse', () => {
  it('flags new-format snapshots as recomputable for reporting currency changes', () => {
    const response = toNetWorthSnapshotResponse(
      createSnapshot({
        nativeAssetTotals: { EUR: 100, USD: 25 },
        nativeLiabilityTotals: { GBP: 10 },
      }),
    );

    expect(response.reportingCurrency).toBe('EUR');
    expect(response.storedReportingCurrency).toBe('EUR');
    expect(response.canRecomputeForReportingCurrency).toBe(true);
  });

  it('keeps legacy snapshots non-recomputable when native totals are missing', () => {
    const response = toNetWorthSnapshotResponse(createSnapshot());

    expect(response.reportingCurrency).toBe('EUR');
    expect(response.storedReportingCurrency).toBe('EUR');
    expect(response.canRecomputeForReportingCurrency).toBe(false);
  });
});
