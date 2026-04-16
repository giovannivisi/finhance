import { ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DashboardController } from '@assets/dashboard.controller';
import { AssetsController } from '@assets/assets.controller';
import { AssetsService } from '@assets/assets.service';
import { PricesService } from '@prices/prices.service';
import { PrismaService } from '@prisma/prisma.service';
import { AssetKind, AssetType, Prisma } from '@prisma/client';

function createAsset(overrides: Partial<Record<string, unknown>> = {}) {
  const now = new Date();

  return {
    id: 'asset-1',
    userId: null,
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
    createdAt: now,
    updatedAt: now,
    lastPrice: null,
    lastPriceAt: null,
    lastFxRate: null,
    lastFxRateAt: null,
    ...overrides,
  };
}

describe('Asset routes (e2e)', () => {
  let app: INestApplication;
  let prisma: {
    asset: {
      findMany: jest.Mock;
      findUnique: jest.Mock;
      update: jest.Mock;
      create: jest.Mock;
      delete: jest.Mock;
    };
    $transaction: jest.Mock;
  };
  let prices: {
    normalizeCurrency: jest.Mock;
    normalizeTicker: jest.Mock;
    buildMarketSymbol: jest.Mock;
    getMarketPrice: jest.Mock;
    getFxRate: jest.Mock;
  };

  beforeEach(async () => {
    prisma = {
      asset: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        create: jest.fn(),
        delete: jest.fn(),
      },
      $transaction: jest.fn(),
    };

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
      getFxRate: jest.fn(),
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [AssetsController, DashboardController],
      providers: [
        AssetsService,
        { provide: PrismaService, useValue: prisma },
        { provide: PricesService, useValue: prices },
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
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue(created),
      update: jest.fn(),
    };

    prisma.$transaction.mockImplementation(async (callback: (tx: { asset: typeof transactionAsset }) => Promise<unknown>) =>
      callback({ asset: transactionAsset }),
    );

    await request(app.getHttpServer())
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
      })
      .expect(201)
      .expect(({ body }) => {
        expect(body.name).toBe('Apple');
      });
  });

  it('rejects duplicate PUT /assets/:id updates with 409', async () => {
    prisma.asset.findUnique
      .mockResolvedValueOnce(createAsset())
      .mockResolvedValueOnce(createAsset({ id: 'asset-2' }));

    await request(app.getHttpServer())
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
      })
      .expect(409);
  });

  it('returns 404 when deleting a missing asset', async () => {
    prisma.asset.findUnique.mockResolvedValue(null);

    await request(app.getHttpServer())
      .delete('/assets/missing')
      .expect(404);
  });

  it('refreshes stored quotes through POST /assets/refresh', async () => {
    const asset = createAsset();
    prisma.asset.findMany
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
    prices.getMarketPrice.mockResolvedValue(new Prisma.Decimal('50'));
    prices.getFxRate.mockResolvedValue(new Prisma.Decimal('0.9'));

    await request(app.getHttpServer())
      .post('/assets/refresh')
      .expect(201)
      .expect(({ body }) => {
        expect(body.updatedCount).toBe(1);
        expect(body.staleCount).toBe(0);
      });
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

    await request(app.getHttpServer())
      .get('/dashboard')
      .expect(200)
      .expect(({ body }) => {
        expect(body.baseCurrency).toBe('EUR');
        expect(body.assets[0].valuationSource).toBe('AVG_COST');
        expect(body.summary.assets).toBe(72);
      });
  });
});
