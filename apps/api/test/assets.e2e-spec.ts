import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  INestApplication,
  ValidationPipe,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AccountsService } from '@accounts/accounts.service';
import { AssetsController } from '@assets/assets.controller';
import { AssetsService } from '@assets/assets.service';
import { BudgetsService } from '@budgets/budgets.service';
import { DashboardController } from '@/dashboard/dashboard.controller';
import { DashboardService } from '@/dashboard/dashboard.service';
import { SetupService } from '@/setup/setup.service';
import type {
  AssetResponse,
  DashboardResponse,
  RefreshAssetsResponse,
} from '@finhance/shared';
import { PricesService } from '@prices/prices.service';
import { PrismaService } from '@prisma/prisma.service';
import { RequestOwnerResolver } from '@/security/request-owner.resolver';
import { SnapshotsService } from '@snapshots/snapshots.service';
import { OperationLockService } from '@/request-safety/operation-lock.service';
import { Asset, AssetKind, AssetType, Prisma } from '@finhance/db';

const OWNER_ID = 'local-dev';
type ResponseWithBody = { body: unknown };
type HttpServer = Parameters<typeof request>[0];

function bodyAs<T>(response: ResponseWithBody): T {
  return response.body as T;
}

function createAsset(overrides: Partial<Asset> = {}): Asset {
  const now = new Date();

  return {
    id: 'asset-1',
    userId: OWNER_ID,
    accountId: null,
    name: 'Apple',
    type: AssetType.ASSET,
    kind: AssetKind.STOCK,
    liabilityKind: null,
    ticker: 'AAPL',
    exchange: '',
    quantity: new Prisma.Decimal('2'),
    unitPrice: new Prisma.Decimal('40'),
    balance: new Prisma.Decimal('80'),
    currency: 'USD',
    notes: null,
    order: 0,
    importSource: null,
    importKey: null,
    createdAt: now,
    updatedAt: now,
    lastPrice: null,
    lastPriceAt: null,
    marketDataSymbol: null,
    lastFxRate: null,
    lastFxRateAt: null,
    ...overrides,
  };
}

function expectAssetResponseDto(
  body: Record<string, unknown>,
  asset: ReturnType<typeof createAsset>,
) {
  expect(body).toEqual({
    id: asset.id,
    name: asset.name,
    type: asset.type,
    accountId: asset.accountId,
    kind: asset.kind,
    liabilityKind: asset.liabilityKind,
    ticker: asset.ticker,
    exchange: asset.exchange,
    quantity: asset.quantity?.toNumber() ?? null,
    unitPrice: asset.unitPrice?.toNumber() ?? null,
    balance: asset.balance.toNumber(),
    currency: asset.currency,
    notes: asset.notes,
    order: asset.order,
    lastPrice: asset.lastPrice ? asset.lastPrice.toNumber() : null,
    lastPriceAt: asset.lastPriceAt?.toISOString() ?? null,
    lastFxRate: asset.lastFxRate ? asset.lastFxRate.toNumber() : null,
    lastFxRateAt: asset.lastFxRateAt?.toISOString() ?? null,
  });
  expect(body).not.toHaveProperty('userId');
  expect(body).not.toHaveProperty('createdAt');
  expect(body).not.toHaveProperty('updatedAt');
}

type RunExclusiveFn = <T>(
  options: unknown,
  work: () => Promise<T>,
) => Promise<T>;

describe('Asset routes (e2e)', () => {
  let app: INestApplication;
  let prisma: {
    asset: {
      findMany: jest.Mock;
      findUnique: jest.Mock;
      findFirst: jest.Mock;
      update: jest.Mock;
      create: jest.Mock;
      delete: jest.Mock;
    };
    user: {
      findUnique: jest.Mock;
    };
    $transaction: jest.Mock;
  };
  let operationLock: { runExclusive: jest.Mock };
  let prices: {
    normalizeCurrency: jest.Mock;
    normalizeTicker: jest.Mock;
    buildMarketSymbol: jest.Mock;
    getMarketPrice: jest.Mock;
    getMarketPriceResult: jest.Mock;
    getMarketPriceResolution: jest.Mock;
    getFxRate: jest.Mock;
    getFxRateForDate: jest.Mock;
    getStoredFxRateSnapshot: jest.Mock;
  };
  let accounts: {
    assertAccountAssignmentAllowed: jest.Mock;
    getAssignableAccount: jest.Mock;
    findAll: jest.Mock;
  };
  let budgets: {
    findMonthly: jest.Mock;
  };
  let setup: {
    getStatus: jest.Mock;
  };
  let snapshots: {
    findLatest: jest.Mock;
    hasSnapshotForDate: jest.Mock;
    captureFromDashboard: jest.Mock;
  };

  function httpServer(): HttpServer {
    return app.getHttpServer() as HttpServer;
  }

  beforeEach(async () => {
    prisma = {
      asset: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
        create: jest.fn(),
        delete: jest.fn(),
      },
      user: {
        findUnique: jest.fn().mockResolvedValue({
          assetKindOrder: null,
          userSettings: { reportingCurrency: 'EUR' },
        }),
      },
      $transaction: jest.fn(),
    };

    prisma.$transaction.mockImplementation(
      async (
        callback: (tx: { asset: typeof prisma.asset }) => Promise<unknown>,
      ) =>
        callback({
          asset: prisma.asset,
        }),
    );

    prices = {
      normalizeCurrency: jest.fn((currency?: string | null) =>
        (currency ?? 'EUR').trim().toUpperCase(),
      ),
      normalizeTicker: jest.fn((ticker: string) => ticker.trim().toUpperCase()),
      buildMarketSymbol: jest.fn(
        (input: { ticker: string; exchange?: string | null }) =>
          `${input.ticker}${input.exchange ?? ''}`,
      ),
      getMarketPrice: jest.fn(),
      getMarketPriceResult: jest.fn(),
      getMarketPriceResolution: jest.fn(),
      getFxRate: jest.fn(),
      getFxRateForDate: jest.fn().mockResolvedValue(new Prisma.Decimal('0.9')),
      getStoredFxRateSnapshot: jest.fn().mockResolvedValue({
        rate: new Prisma.Decimal('0.9'),
        status: 'EXACT',
        source: 'LIVE',
        rateDate: new Date(),
        updatedAt: new Date(),
      }),
    };

    accounts = {
      assertAccountAssignmentAllowed: jest.fn(),
      findAll: jest.fn().mockResolvedValue([]),
      getAssignableAccount: jest.fn().mockResolvedValue({
        id: 'account-1',
        type: 'BROKER',
        archivedAt: null,
      }),
    };
    budgets = {
      findMonthly: jest.fn().mockResolvedValue(null),
    };
    setup = {
      getStatus: jest.fn().mockResolvedValue(null),
    };

    snapshots = {
      findLatest: jest.fn(),
      hasSnapshotForDate: jest.fn().mockResolvedValue(true),
      captureFromDashboard: jest.fn().mockResolvedValue(undefined),
    };

    const passThrough: RunExclusiveFn = async (_options, work) => work();
    operationLock = {
      runExclusive: jest.fn(passThrough),
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [AssetsController, DashboardController],
      providers: [
        AssetsService,
        DashboardService,
        { provide: AccountsService, useValue: accounts },
        { provide: BudgetsService, useValue: budgets },
        { provide: PrismaService, useValue: prisma },
        { provide: PricesService, useValue: prices },
        { provide: SetupService, useValue: setup },
        { provide: SnapshotsService, useValue: snapshots },
        {
          provide: OperationLockService,
          useValue: operationLock,
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
    await app.close();
  });

  it('creates a market position through POST /assets', async () => {
    const created = createAsset();
    const transactionAsset = {
      findFirst: jest.fn().mockResolvedValue(null),
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue(created),
      update: jest.fn(),
    };

    prisma.$transaction.mockImplementation(
      async (
        callback: (tx: { asset: typeof transactionAsset }) => Promise<unknown>,
      ) =>
        callback({
          asset: transactionAsset,
        }),
    );

    await request(httpServer())
      .post('/assets')
      .send({
        name: 'Apple',
        type: 'ASSET',
        kind: 'STOCK',
        ticker: 'aapl',
        exchange: '',
        quantity: 2,
        unitPrice: 40,
        currency: 'usd',
        accountId: 'account-1',
      })
      .expect(201)
      .expect((response: ResponseWithBody) => {
        const body = bodyAs<Record<string, unknown>>(response);
        expectAssetResponseDto(body, created);
      });
  });

  it('creates a direct-balance asset with accountId through POST /assets', async () => {
    const created = createAsset({
      accountId: 'account-1',
      kind: AssetKind.CASH,
      ticker: null,
      exchange: null,
      quantity: null,
      unitPrice: null,
      balance: new Prisma.Decimal('100'),
      currency: 'EUR',
    });
    prisma.asset.create.mockResolvedValue(created);

    await request(httpServer())
      .post('/assets')
      .send({
        name: 'Cash reserve',
        type: 'ASSET',
        kind: 'CASH',
        balance: 100,
        currency: 'eur',
        accountId: 'account-1',
      })
      .expect(201)
      .expect((response: ResponseWithBody) => {
        const body = bodyAs<Record<string, unknown>>(response);
        expectAssetResponseDto(body, created);
      });

    expect(accounts.assertAccountAssignmentAllowed).toHaveBeenCalledWith(
      OWNER_ID,
      'account-1',
    );
  });

  it('rejects market assets assigned to non-broker accounts through POST /assets', async () => {
    accounts.getAssignableAccount.mockResolvedValueOnce({
      id: 'account-1',
      type: 'BANK',
      archivedAt: null,
    });

    await request(httpServer())
      .post('/assets')
      .send({
        name: 'VWCE',
        type: 'ASSET',
        kind: 'STOCK',
        ticker: 'VWCE',
        exchange: '.MI',
        quantity: 2,
        unitPrice: 100,
        currency: 'EUR',
        accountId: 'account-1',
      })
      .expect(400)
      .expect((response: ResponseWithBody) => {
        expect(bodyAs<Record<string, unknown>>(response).message).toContain(
          'Market assets must belong to a BROKER account.',
        );
      });
  });

  it('rejects overly long asset notes on POST /assets', async () => {
    await request(httpServer())
      .post('/assets')
      .send({
        name: 'Cash reserve',
        type: 'ASSET',
        kind: 'CASH',
        balance: 100,
        currency: 'EUR',
        notes: 'N'.repeat(2001),
      })
      .expect(400);
  });

  it('returns DTO responses from GET /assets', async () => {
    const asset = createAsset();
    prisma.asset.findMany.mockResolvedValue([asset]);

    await request(httpServer())
      .get('/assets')
      .expect(200)
      .expect((response: ResponseWithBody) => {
        const body = bodyAs<AssetResponse[]>(response);
        expect(body).toHaveLength(1);
        expectAssetResponseDto(
          body[0] as unknown as Record<string, unknown>,
          asset,
        );
      });
  });

  it('returns DTO responses from GET /assets/:id', async () => {
    const asset = createAsset();
    prisma.asset.findFirst.mockResolvedValue(asset);

    await request(httpServer())
      .get('/assets/asset-1')
      .expect(200)
      .expect((response: ResponseWithBody) => {
        const body = bodyAs<Record<string, unknown>>(response);
        expectAssetResponseDto(body, asset);
      });
  });

  it('rejects client-controlled userId on POST /assets', async () => {
    await request(httpServer())
      .post('/assets')
      .send({
        userId: 'spoofed-user',
        name: 'Apple',
        type: 'ASSET',
        kind: 'STOCK',
        ticker: 'aapl',
        exchange: '',
        quantity: 2,
        unitPrice: 40,
        currency: 'usd',
      })
      .expect(400);
  });

  it('rejects client-controlled userId on PUT /assets/:id', async () => {
    await request(httpServer())
      .put('/assets/asset-1')
      .send({
        userId: 'spoofed-user',
        name: 'Apple',
        type: 'ASSET',
        kind: 'STOCK',
        ticker: 'AAPL',
        exchange: '',
        quantity: 2,
        unitPrice: 40,
        currency: 'USD',
      })
      .expect(400);
  });

  it('rejects duplicate PUT /assets/:id updates with 409', async () => {
    prisma.asset.findFirst
      .mockResolvedValueOnce(createAsset())
      .mockResolvedValueOnce(createAsset({ id: 'asset-2' }));

    await request(httpServer())
      .put('/assets/asset-1')
      .send({
        name: 'Apple',
        type: 'ASSET',
        kind: 'STOCK',
        ticker: 'AAPL',
        exchange: '',
        quantity: 2,
        unitPrice: 40,
        currency: 'USD',
        accountId: 'account-1',
      })
      .expect(409);
  });

  it('rejects invalid accountId on PUT /assets/:id', async () => {
    prisma.asset.findFirst.mockResolvedValueOnce(
      createAsset({
        kind: AssetKind.CASH,
        ticker: null,
        exchange: null,
        quantity: null,
        unitPrice: null,
        balance: new Prisma.Decimal('100'),
        currency: 'EUR',
      }),
    );
    accounts.assertAccountAssignmentAllowed.mockRejectedValueOnce(
      new BadRequestException('Account missing'),
    );

    await request(httpServer())
      .put('/assets/asset-1')
      .send({
        name: 'Cash reserve',
        type: 'ASSET',
        kind: 'CASH',
        balance: 100,
        currency: 'EUR',
        accountId: 'missing-account',
      })
      .expect(400);
  });

  it('returns 404 when deleting a missing asset', async () => {
    prisma.asset.findFirst.mockResolvedValue(null);

    await request(httpServer()).delete('/assets/missing').expect(404);
  });

  it('refreshes stored quotes through POST /assets/refresh', async () => {
    const asset = createAsset();
    prisma.asset.findMany.mockResolvedValueOnce([asset]).mockResolvedValueOnce([
      createAsset({
        lastPrice: new Prisma.Decimal('50'),
        lastPriceAt: new Date(),
        lastFxRate: new Prisma.Decimal('0.9'),
        lastFxRateAt: new Date(),
      }),
    ]);
    prisma.asset.update.mockResolvedValue(asset);
    prices.getMarketPriceResolution.mockResolvedValue({
      marketSymbol: 'marketstack:AAPL@XNAS',
      result: {
        price: new Prisma.Decimal('50'),
        failure: null,
      },
    });
    prices.getFxRate.mockResolvedValue(new Prisma.Decimal('0.9'));

    await request(httpServer())
      .post('/assets/refresh')
      .expect(201)
      .expect((response: ResponseWithBody) => {
        const body = bodyAs<RefreshAssetsResponse>(response);
        expect(body.updatedCount).toBe(1);
        expect(body.staleCount).toBe(0);
        expect(body.priceRefresh).toEqual({
          status: 'SUCCESS',
          requestedCount: 1,
          refreshedCount: 1,
          failedCount: 0,
          message: null,
        });
      });

    expect(operationLock.runExclusive).toHaveBeenCalledTimes(1);
  });

  it('returns 429 after a recent successful refresh', async () => {
    operationLock.runExclusive.mockImplementationOnce(() => {
      throw new HttpException(
        'Refresh is cooling down. Try again in 10s.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    });

    await request(httpServer()).post('/assets/refresh').expect(429);
  });

  it('allows immediate retry after a failed refresh', async () => {
    const asset = createAsset();
    prisma.asset.findMany
      .mockResolvedValueOnce([asset])
      .mockResolvedValueOnce([asset])
      .mockResolvedValueOnce([
        createAsset({
          lastPrice: new Prisma.Decimal('50'),
          lastPriceAt: new Date(),
          lastFxRate: new Prisma.Decimal('0.9'),
          lastFxRateAt: new Date(),
        }),
      ]);
    prisma.asset.update.mockResolvedValue(asset);
    prices.getMarketPriceResolution
      .mockResolvedValueOnce({
        marketSymbol: 'marketstack:AAPL@XNAS',
        result: {
          price: null,
          failure: {
            provider: 'Marketstack',
            reason: 'RATE_LIMITED',
            status: 429,
          },
        },
      })
      .mockResolvedValueOnce({
        marketSymbol: 'marketstack:AAPL@XNAS',
        result: {
          price: new Prisma.Decimal('50'),
          failure: null,
        },
      });
    prices.getFxRate.mockResolvedValue(new Prisma.Decimal('0.9'));

    await request(httpServer())
      .post('/assets/refresh')
      .expect(503)
      .expect((response: ResponseWithBody) => {
        expect(response.body).toEqual(
          expect.objectContaining({
            message:
              'Marketstack is rate-limiting price requests. Stored prices were kept; try again later.',
          }),
        );
      });
    await request(httpServer())
      .post('/assets/refresh')
      .expect(201)
      .expect((response: ResponseWithBody) => {
        const body = bodyAs<RefreshAssetsResponse>(response);
        expect(body.updatedCount).toBe(1);
      });

    expect(operationLock.runExclusive).toHaveBeenCalledTimes(2);
  });

  it('returns 409 while a refresh is already in flight', async () => {
    operationLock.runExclusive.mockImplementationOnce(() => {
      throw new ConflictException('Refresh already in progress.');
    });

    await request(httpServer()).post('/assets/refresh').expect(409);
  });

  it('returns fallback valuation metadata from GET /dashboard', async () => {
    prisma.asset.findMany.mockResolvedValue([
      createAsset({
        lastPrice: null,
        lastPriceAt: null,
        lastFxRate: new Prisma.Decimal('0.9'),
        lastFxRateAt: new Date(),
      }),
    ]);

    await request(httpServer())
      .get('/dashboard')
      .expect(200)
      .expect((response: ResponseWithBody) => {
        const body = bodyAs<DashboardResponse>(response);
        expect(body.reportingCurrency).toBe('EUR');
        expect(body.assets[0].valuationSource).toBe('AVG_COST');
        expect(body.summary.assets).toBe(72);
        expect(body.latestSnapshotDate).toBeNull();
        expect(body.latestSnapshotCapturedAt).toBeNull();
        expect(body.latestSnapshotIsPartial).toBeNull();
      });
  });
});
