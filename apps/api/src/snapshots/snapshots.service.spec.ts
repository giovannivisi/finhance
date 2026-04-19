import { SnapshotsService } from '@snapshots/snapshots.service';
import type { DashboardResponse } from '@finhance/shared';
import { Prisma } from '@prisma/client';

const OWNER_ID = 'local-dev';

type SnapshotUpsertCall = {
  where: {
    userId_snapshotDate_baseCurrency: {
      userId: string;
      snapshotDate: Date;
      baseCurrency: string;
    };
  };
  create: {
    unavailableCount: number;
    isPartial: boolean;
  };
  update: {
    unavailableCount: number;
    isPartial: boolean;
  };
};

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

function nthCallArg<T>(mockFn: jest.Mock, index: number): T {
  const calls = mockFn.mock.calls as unknown[][];
  return calls[index]?.[0] as T;
}

describe('SnapshotsService', () => {
  let service: SnapshotsService;
  let prisma: {
    netWorthSnapshot: {
      upsert: jest.Mock;
      findMany: jest.Mock;
      findFirst: jest.Mock;
      findUnique: jest.Mock;
    };
  };
  let assets: {
    getDashboard: jest.Mock;
  };

  beforeEach(() => {
    jest.useFakeTimers();

    prisma = {
      netWorthSnapshot: {
        upsert: jest.fn(),
        findMany: jest.fn(),
        findFirst: jest.fn(),
        findUnique: jest.fn(),
      },
    };

    assets = {
      getDashboard: jest.fn(),
    };

    service = new SnapshotsService(prisma as never, assets as never);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('captures totals directly from the current dashboard summary', async () => {
    jest.setSystemTime(new Date('2026-04-17T10:15:00.000Z'));
    assets.getDashboard.mockResolvedValue(createDashboard());
    prisma.netWorthSnapshot.upsert.mockResolvedValue(createSnapshot());

    await service.capture(OWNER_ID);

    const upsertCall = nthCallArg<SnapshotUpsertCall>(
      prisma.netWorthSnapshot.upsert,
      0,
    );
    expect(upsertCall.where.userId_snapshotDate_baseCurrency).toEqual({
      userId: OWNER_ID,
      snapshotDate: new Date('2026-04-17T00:00:00.000Z'),
      baseCurrency: 'EUR',
    });
    expect(upsertCall.create).toMatchObject({
      unavailableCount: 0,
      isPartial: false,
    });
    expect(upsertCall.update).toMatchObject({
      unavailableCount: 0,
      isPartial: false,
    });
  });

  it('uses the same Europe/Rome date key for repeated captures within one day', async () => {
    assets.getDashboard.mockResolvedValue(createDashboard());
    prisma.netWorthSnapshot.upsert.mockResolvedValue(createSnapshot());

    jest.setSystemTime(new Date('2026-04-17T08:00:00.000Z'));
    await service.capture(OWNER_ID);

    jest.setSystemTime(new Date('2026-04-17T20:30:00.000Z'));
    await service.capture(OWNER_ID);

    const firstCall = nthCallArg<SnapshotUpsertCall>(
      prisma.netWorthSnapshot.upsert,
      0,
    );
    const secondCall = nthCallArg<SnapshotUpsertCall>(
      prisma.netWorthSnapshot.upsert,
      1,
    );

    expect(
      firstCall.where.userId_snapshotDate_baseCurrency.snapshotDate,
    ).toEqual(new Date('2026-04-17T00:00:00.000Z'));
    expect(
      secondCall.where.userId_snapshotDate_baseCurrency.snapshotDate,
    ).toEqual(new Date('2026-04-17T00:00:00.000Z'));
  });

  it('buckets snapshot dates using Europe/Rome rather than UTC', async () => {
    assets.getDashboard.mockResolvedValue(createDashboard());
    prisma.netWorthSnapshot.upsert.mockResolvedValue(createSnapshot());

    jest.setSystemTime(new Date('2026-04-17T22:30:00.000Z'));
    await service.capture(OWNER_ID);

    const upsertCall = nthCallArg<SnapshotUpsertCall>(
      prisma.netWorthSnapshot.upsert,
      0,
    );

    expect(
      upsertCall.where.userId_snapshotDate_baseCurrency.snapshotDate,
    ).toEqual(new Date('2026-04-18T00:00:00.000Z'));
  });

  it('marks snapshots partial when valuations are unavailable for totals', async () => {
    assets.getDashboard.mockResolvedValue(
      createDashboard({
        assets: [
          {
            ...createDashboard().assets[0],
            id: 'asset-1',
            currentValue: null,
            referenceValue: null,
            valuationSource: 'UNAVAILABLE',
          },
          {
            ...createDashboard().assets[0],
            id: 'asset-2',
            currentValue: null,
            referenceValue: 50,
            valuationSource: 'AVG_COST',
          },
        ],
      }),
    );
    prisma.netWorthSnapshot.upsert.mockResolvedValue(
      createSnapshot({
        unavailableCount: 1,
        isPartial: true,
      }),
    );

    await service.capture(OWNER_ID);

    const upsertCall = nthCallArg<SnapshotUpsertCall>(
      prisma.netWorthSnapshot.upsert,
      0,
    );
    expect(upsertCall.create).toMatchObject({
      unavailableCount: 1,
      isPartial: true,
    });
  });

  it('returns snapshots in ascending date order', async () => {
    prisma.netWorthSnapshot.findMany.mockResolvedValue([
      createSnapshot(),
      createSnapshot({
        id: 'snapshot-2',
        snapshotDate: new Date('2026-04-18T00:00:00.000Z'),
      }),
    ]);

    await service.findAll(OWNER_ID);

    expect(prisma.netWorthSnapshot.findMany).toHaveBeenCalledWith({
      where: { userId: OWNER_ID },
      orderBy: [{ snapshotDate: 'asc' }, { createdAt: 'asc' }],
    });
  });

  it('returns the latest snapshot for one owner and base currency', async () => {
    prisma.netWorthSnapshot.findFirst.mockResolvedValue(createSnapshot());

    await service.findLatest(OWNER_ID, 'EUR');

    expect(prisma.netWorthSnapshot.findFirst).toHaveBeenCalledWith({
      where: {
        userId: OWNER_ID,
        baseCurrency: 'EUR',
      },
      orderBy: [{ snapshotDate: 'desc' }, { createdAt: 'desc' }],
    });
  });

  it('checks whether a same-day snapshot already exists', async () => {
    jest.setSystemTime(new Date('2026-04-17T10:15:00.000Z'));
    prisma.netWorthSnapshot.findUnique.mockResolvedValue(createSnapshot());

    await expect(service.hasSnapshotForDate(OWNER_ID, 'EUR')).resolves.toBe(
      true,
    );

    expect(prisma.netWorthSnapshot.findUnique).toHaveBeenCalledWith({
      where: {
        userId_snapshotDate_baseCurrency: {
          userId: OWNER_ID,
          snapshotDate: new Date('2026-04-17T00:00:00.000Z'),
          baseCurrency: 'EUR',
        },
      },
    });
  });
});
