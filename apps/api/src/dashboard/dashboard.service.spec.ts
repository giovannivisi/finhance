import { DashboardService } from '@/dashboard/dashboard.service';
import type { DashboardResponse } from '@finhance/shared';
import { Prisma } from '@prisma/client';

const OWNER_ID = 'local-dev';

function createDashboard(
  overrides: Partial<DashboardResponse> = {},
): DashboardResponse {
  return {
    baseCurrency: 'EUR',
    assets: [
      {
        id: 'asset-1',
        name: 'Cash',
        type: 'ASSET',
        accountId: null,
        kind: 'CASH',
        liabilityKind: null,
        ticker: null,
        exchange: null,
        quantity: null,
        unitPrice: null,
        balance: 100,
        currency: 'EUR',
        notes: null,
        order: 0,
        lastPrice: null,
        lastPriceAt: null,
        lastFxRate: null,
        lastFxRateAt: null,
        currentValue: 100,
        referenceValue: 100,
        valuationSource: 'DIRECT_BALANCE',
        valuationAsOf: '2026-04-17T10:00:00.000Z',
        isStale: false,
      },
    ],
    summary: {
      assets: 100,
      liabilities: 25,
      netWorth: 75,
    },
    lastRefreshAt: '2026-04-17T10:00:00.000Z',
    latestSnapshotDate: null,
    latestSnapshotCapturedAt: null,
    latestSnapshotIsPartial: null,
    ...overrides,
  };
}

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
    unavailableCount: 0,
    isPartial: false,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe('DashboardService', () => {
  let service: DashboardService;
  let assets: {
    getDashboard: jest.Mock;
  };
  let snapshots: {
    findLatest: jest.Mock;
    hasSnapshotForDate: jest.Mock;
  };

  beforeEach(() => {
    assets = {
      getDashboard: jest.fn(),
    };

    snapshots = {
      findLatest: jest.fn(),
      hasSnapshotForDate: jest.fn(),
    };

    service = new DashboardService(assets as never, snapshots as never);
  });

  it('returns latest snapshot metadata without triggering a write when today is missing', async () => {
    const dashboard = createDashboard();
    const latestSnapshot = createSnapshot({
      snapshotDate: new Date('2026-04-16T00:00:00.000Z'),
      capturedAt: new Date('2026-04-16T21:15:00.000Z'),
      isPartial: true,
    });
    assets.getDashboard.mockResolvedValue(dashboard);
    snapshots.findLatest.mockResolvedValue(latestSnapshot);
    snapshots.hasSnapshotForDate.mockResolvedValue(false);

    const result = await service.getDashboard(OWNER_ID);

    expect(result.latestSnapshotDate).toBe('2026-04-16');
    expect(result.latestSnapshotCapturedAt).toBe('2026-04-16T21:15:00.000Z');
    expect(result.latestSnapshotIsPartial).toBe(true);
  });

  it('does not trigger background capture when a same-day snapshot already exists', async () => {
    const dashboard = createDashboard();
    const latestSnapshot = createSnapshot();
    assets.getDashboard.mockResolvedValue(dashboard);
    snapshots.findLatest.mockResolvedValue(latestSnapshot);
    snapshots.hasSnapshotForDate.mockResolvedValue(true);

    const result = await service.getDashboard(OWNER_ID);

    expect(result.latestSnapshotDate).toBe('2026-04-17');
    expect(result.latestSnapshotCapturedAt).toBe('2026-04-17T10:00:00.000Z');
    expect(result.latestSnapshotIsPartial).toBe(false);
  });

  it('returns null snapshot metadata when no snapshot exists yet', async () => {
    assets.getDashboard.mockResolvedValue(createDashboard());
    snapshots.findLatest.mockResolvedValue(null);
    snapshots.hasSnapshotForDate.mockResolvedValue(false);

    const result = await service.getDashboard(OWNER_ID);

    expect(result.latestSnapshotDate).toBeNull();
    expect(result.latestSnapshotCapturedAt).toBeNull();
    expect(result.latestSnapshotIsPartial).toBeNull();
  });
});
