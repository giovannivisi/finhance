import { Logger } from '@nestjs/common';
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
    captureFromDashboard: jest.Mock;
  };
  let loggerErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    assets = {
      getDashboard: jest.fn(),
    };

    snapshots = {
      findLatest: jest.fn(),
      hasSnapshotForDate: jest.fn(),
      captureFromDashboard: jest.fn(),
    };

    service = new DashboardService(assets as never, snapshots as never);
    loggerErrorSpy = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
  });

  afterEach(() => {
    loggerErrorSpy.mockRestore();
  });

  it('returns latest snapshot metadata and triggers background capture when today is missing', async () => {
    const dashboard = createDashboard();
    const latestSnapshot = createSnapshot({
      snapshotDate: new Date('2026-04-16T00:00:00.000Z'),
      capturedAt: new Date('2026-04-16T21:15:00.000Z'),
      isPartial: true,
    });
    assets.getDashboard.mockResolvedValue(dashboard);
    snapshots.findLatest.mockResolvedValue(latestSnapshot);
    snapshots.hasSnapshotForDate.mockResolvedValue(false);
    snapshots.captureFromDashboard.mockResolvedValue(createSnapshot());

    const result = await service.getDashboard(OWNER_ID);

    expect(result.latestSnapshotDate).toBe('2026-04-16');
    expect(result.latestSnapshotCapturedAt).toBe('2026-04-16T21:15:00.000Z');
    expect(result.latestSnapshotIsPartial).toBe(true);
    expect(snapshots.captureFromDashboard).toHaveBeenCalledWith(
      OWNER_ID,
      dashboard,
    );
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
    expect(snapshots.captureFromDashboard).not.toHaveBeenCalled();
  });

  it('logs opportunistic capture failures without failing the dashboard response', async () => {
    const dashboard = createDashboard();
    const failure = new Error('boom');
    assets.getDashboard.mockResolvedValue(dashboard);
    snapshots.findLatest.mockResolvedValue(null);
    snapshots.hasSnapshotForDate.mockResolvedValue(false);
    snapshots.captureFromDashboard.mockRejectedValue(failure);

    const result = await service.getDashboard(OWNER_ID);
    await Promise.resolve();

    expect(result.latestSnapshotDate).toBeNull();
    expect(result.latestSnapshotCapturedAt).toBeNull();
    expect(result.latestSnapshotIsPartial).toBeNull();
    expect(loggerErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining(
        'Failed opportunistic snapshot capture for owner=local-dev baseCurrency=EUR: boom',
      ),
      failure.stack,
    );
  });
});
