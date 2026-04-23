import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AssetsService } from '@assets/assets.service';
import { RequestOwnerResolver } from '@/security/request-owner.resolver';
import { OperationLockService } from '@/request-safety/operation-lock.service';
import { PrismaService } from '@prisma/prisma.service';
import { SnapshotsController } from '@snapshots/snapshots.controller';
import { SnapshotsService } from '@snapshots/snapshots.service';
import type {
  DashboardResponse,
  NetWorthSnapshotResponse,
} from '@finhance/shared';
import { Prisma } from '@prisma/client';

const OWNER_ID = 'local-dev';
type ResponseWithBody = { body: unknown };
type HttpServer = Parameters<typeof request>[0];
type SnapshotUpsertCall = {
  where: {
    userId_snapshotDate_baseCurrency: {
      userId: string;
      snapshotDate: Date;
      baseCurrency: string;
    };
  };
};

function bodyAs<T>(response: ResponseWithBody): T {
  return response.body as T;
}

function nthCallArg<T>(mockFn: jest.Mock, index: number): T {
  const calls = mockFn.mock.calls as unknown[][];
  return calls[index]?.[0] as T;
}

function createDashboard(): DashboardResponse {
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
      liabilities: 0,
      netWorth: 100,
    },
    lastRefreshAt: '2026-04-17T10:00:00.000Z',
    latestSnapshotDate: null,
    latestSnapshotCapturedAt: null,
    latestSnapshotIsPartial: null,
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
    liabilitiesTotal: new Prisma.Decimal('0'),
    netWorthTotal: new Prisma.Decimal('100'),
    unavailableCount: 0,
    isPartial: false,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function expectSnapshotResponseDto(
  body: Record<string, unknown>,
  snapshot: ReturnType<typeof createSnapshot>,
) {
  expect(body).toEqual({
    id: snapshot.id,
    snapshotDate: snapshot.snapshotDate.toISOString().slice(0, 10),
    capturedAt: snapshot.capturedAt.toISOString(),
    baseCurrency: snapshot.baseCurrency,
    assetsTotal: snapshot.assetsTotal.toNumber(),
    liabilitiesTotal: snapshot.liabilitiesTotal.toNumber(),
    netWorthTotal: snapshot.netWorthTotal.toNumber(),
    unavailableCount: snapshot.unavailableCount,
    isPartial: snapshot.isPartial,
    createdAt: snapshot.createdAt.toISOString(),
    updatedAt: snapshot.updatedAt.toISOString(),
  });
  expect(body).not.toHaveProperty('userId');
}

describe('Snapshot routes (e2e)', () => {
  let app: INestApplication;
  let prisma: {
    netWorthSnapshot: {
      upsert: jest.Mock;
      findMany: jest.Mock;
    };
  };
  let assets: {
    getDashboard: jest.Mock;
  };

  function httpServer(): HttpServer {
    return app.getHttpServer() as HttpServer;
  }

  beforeEach(async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-04-17T10:15:00.000Z'));

    prisma = {
      netWorthSnapshot: {
        upsert: jest.fn(),
        findMany: jest.fn(),
      },
    };

    assets = {
      getDashboard: jest.fn().mockResolvedValue(createDashboard()),
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [SnapshotsController],
      providers: [
        SnapshotsService,
        { provide: PrismaService, useValue: prisma },
        { provide: AssetsService, useValue: assets },
        {
          provide: OperationLockService,
          useValue: {
            runExclusive: jest.fn(
              async <T>(
                _options: unknown,
                work: () => Promise<T>,
              ): Promise<T> => work(),
            ),
          },
        },
        {
          provide: RequestOwnerResolver,
          useValue: {
            resolveOwnerId: () => OWNER_ID,
          },
        },
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
  });

  afterEach(async () => {
    jest.useRealTimers();
    await app.close();
  });

  it('creates the first snapshot through POST /snapshots/capture', async () => {
    const snapshot = createSnapshot();
    prisma.netWorthSnapshot.upsert.mockResolvedValue(snapshot);

    await request(httpServer())
      .post('/snapshots/capture')
      .send({})
      .expect(201)
      .expect((response: ResponseWithBody) => {
        const body = bodyAs<Record<string, unknown>>(response);
        expectSnapshotResponseDto(body, snapshot);
      });
  });

  it('reuses the same same-day upsert key on repeated captures', async () => {
    prisma.netWorthSnapshot.upsert
      .mockResolvedValueOnce(createSnapshot())
      .mockResolvedValueOnce(
        createSnapshot({
          capturedAt: new Date('2026-04-17T21:00:00.000Z'),
          updatedAt: new Date('2026-04-17T21:00:00.000Z'),
        }),
      );

    await request(httpServer()).post('/snapshots/capture').send({}).expect(201);

    jest.setSystemTime(new Date('2026-04-17T21:00:00.000Z'));
    await request(httpServer()).post('/snapshots/capture').send({}).expect(201);

    const firstKey = nthCallArg<SnapshotUpsertCall>(
      prisma.netWorthSnapshot.upsert,
      0,
    ).where.userId_snapshotDate_baseCurrency;
    const secondKey = nthCallArg<SnapshotUpsertCall>(
      prisma.netWorthSnapshot.upsert,
      1,
    ).where.userId_snapshotDate_baseCurrency;

    expect(firstKey).toEqual(secondKey);
  });

  it('rejects extra body fields on POST /snapshots/capture', async () => {
    await request(httpServer())
      .post('/snapshots/capture')
      .send({ snapshotDate: '2026-04-17' })
      .expect(400);
  });

  it('returns owner-scoped snapshots from GET /snapshots', async () => {
    const snapshot = createSnapshot();
    prisma.netWorthSnapshot.findMany.mockResolvedValue([snapshot]);

    await request(httpServer())
      .get('/snapshots')
      .expect(200)
      .expect((response: ResponseWithBody) => {
        const body = bodyAs<NetWorthSnapshotResponse[]>(response);
        expect(body).toHaveLength(1);
        expectSnapshotResponseDto(
          body[0] as unknown as Record<string, unknown>,
          snapshot,
        );
      });

    expect(prisma.netWorthSnapshot.findMany).toHaveBeenCalledWith({
      where: { userId: OWNER_ID },
      orderBy: [{ snapshotDate: 'asc' }, { createdAt: 'asc' }],
    });
  });
});
