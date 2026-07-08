import {
  ConflictException,
  INestApplication,
  ValidationPipe,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { Prisma, PrismaClient } from '@finhance/db';
import { AppModule } from '@/app.module';
import { PricesService } from '@prices/prices.service';
import type {
  BrokerageAccountSummaryResponse,
  BrokerageOperationResponse,
  BrokerageWorkspaceResponse,
  PortfolioAllocationTargetsResponse,
} from '@finhance/shared';
import { createPrismaTestSchema } from './prisma-test-schema';

const OWNER_ID = 'local-dev';

type ResponseWithBody = { body: unknown };
type HttpServer = Parameters<typeof request>[0];

function bodyAs<T>(response: ResponseWithBody): T {
  return response.body as T;
}

jest.setTimeout(90_000);

describe('Brokerage routes with Prisma schema (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let disposeSchema: (() => Promise<void>) | undefined;

  function httpServer(): HttpServer {
    return app.getHttpServer() as HttpServer;
  }

  beforeAll(async () => {
    const schema = await createPrismaTestSchema('brokerage_routes');
    disposeSchema = async () => schema.dispose();
    process.env.DATABASE_URL = schema.databaseUrl;
    process.env.AUTH_MODE = 'local';

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PricesService)
      .useValue({
        normalizeCurrency: jest.fn((currency?: string | null) =>
          (currency ?? 'EUR').trim().toUpperCase(),
        ),
        normalizeTicker: jest.fn((ticker?: string | null) =>
          (ticker ?? '').trim().toUpperCase(),
        ),
        buildMarketSymbol: jest.fn(
          (input: { ticker: string; exchange?: string | null }) =>
            `${input.ticker}${input.exchange ?? ''}`,
        ),
        getMarketPrice: jest.fn(() =>
          Promise.reject(
            new ConflictException('Unexpected live price lookup in e2e test.'),
          ),
        ),
        getFxRate: jest.fn(() => Promise.resolve(1)),
      })
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();

    prisma = new PrismaClient();
    await prisma.$connect();
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
    await disposeSchema?.();
  });

  beforeEach(async () => {
    await prisma.brokerageOperation.deleteMany();
    await prisma.portfolioSecurityTarget.deleteMany();
    await prisma.portfolioAssetKindTarget.deleteMany();
    await prisma.transaction.deleteMany();
    await prisma.asset.deleteMany();
    await prisma.account.deleteMany();
    await prisma.category.deleteMany();
  });

  async function seedBrokerageWorkspace() {
    await prisma.account.create({
      data: {
        id: 'broker-1',
        userId: OWNER_ID,
        name: 'Interactive Brokers',
        type: 'BROKER',
        currency: 'EUR',
        institution: 'Interactive Brokers',
        openingBalance: new Prisma.Decimal('0'),
      },
    });

    await prisma.category.createMany({
      data: [
        {
          id: 'income-investing',
          userId: OWNER_ID,
          name: 'Investing',
          type: 'INCOME',
          order: 0,
        },
        {
          id: 'expense-investing',
          userId: OWNER_ID,
          name: 'Investing',
          type: 'EXPENSE',
          order: 0,
        },
        {
          id: 'expense-broker-fees',
          userId: OWNER_ID,
          name: 'Broker fees',
          type: 'EXPENSE',
          parentCategoryId: 'expense-investing',
          order: 0,
        },
      ],
    });

    await prisma.asset.createMany({
      data: [
        {
          id: 'cash-1',
          userId: OWNER_ID,
          accountId: 'broker-1',
          name: 'Broker cash',
          type: 'ASSET',
          kind: 'CASH',
          balance: new Prisma.Decimal('1000'),
          currency: 'EUR',
        },
        {
          id: 'asset-stock',
          userId: OWNER_ID,
          accountId: 'broker-1',
          name: 'VWCE',
          type: 'ASSET',
          kind: 'STOCK',
          ticker: 'VWCE',
          exchange: '.MI',
          quantity: new Prisma.Decimal('10'),
          unitPrice: new Prisma.Decimal('50'),
          balance: new Prisma.Decimal('500'),
          lastPrice: new Prisma.Decimal('55'),
          lastPriceAt: new Date('2026-05-20T10:00:00.000Z'),
          currency: 'EUR',
        },
      ],
    });
  }

  it('lists brokerage accounts and builds the workspace from real tables', async () => {
    await seedBrokerageWorkspace();

    const listResponse = await request(httpServer())
      .get('/brokerage')
      .expect(200);
    const brokers = bodyAs<BrokerageAccountSummaryResponse[]>(listResponse);
    expect(brokers).toHaveLength(1);
    expect(brokers[0]).toMatchObject({
      account: {
        id: 'broker-1',
        name: 'Interactive Brokers',
      },
      cashAvailable: 1000,
      investedValue: 550,
      totalValue: 1550,
      activePositionCount: 1,
    });

    const workspaceResponse = await request(httpServer())
      .get('/brokerage/broker-1')
      .expect(200);
    const workspace = bodyAs<BrokerageWorkspaceResponse>(workspaceResponse);

    expect(workspace.selectedBroker.account.id).toBe('broker-1');
    expect(workspace.positions).toHaveLength(1);
    expect(workspace.positions[0]).toMatchObject({
      assetId: 'asset-stock',
      name: 'VWCE',
      quantity: 10,
      costBasis: 500,
      currentValue: 550,
    });
  });

  it('records buy, sell, dividend, fee, and target updates against real tables', async () => {
    await seedBrokerageWorkspace();

    const buyResponse = await request(httpServer())
      .post('/brokerage/broker-1/buy')
      .set('Idempotency-Key', 'buy-1')
      .send({
        name: 'ACWI',
        kind: 'STOCK',
        ticker: 'ACWI',
        exchange: '.MI',
        currency: 'EUR',
        quantity: 2,
        unitPrice: 100,
        feeAmount: 1,
        postedAt: '2026-05-20T09:00:00.000Z',
      })
      .expect(201);
    expect(bodyAs<BrokerageOperationResponse>(buyResponse).kind).toBe('BUY');

    const boughtAsset = await prisma.asset.findFirst({
      where: { userId: OWNER_ID, ticker: 'ACWI', accountId: 'broker-1' },
    });
    expect(boughtAsset).not.toBeNull();
    expect(boughtAsset?.quantity?.toNumber()).toBe(2);
    expect(boughtAsset?.balance.toNumber()).toBe(201);

    const sellResponse = await request(httpServer())
      .post('/brokerage/broker-1/sell')
      .set('Idempotency-Key', 'sell-1')
      .send({
        assetId: 'asset-stock',
        quantity: 4,
        unitPrice: 60,
        feeAmount: 2,
        postedAt: '2026-05-20T10:00:00.000Z',
      })
      .expect(201);
    expect(bodyAs<BrokerageOperationResponse>(sellResponse).kind).toBe('SELL');

    const soldAsset = await prisma.asset.findUnique({
      where: { id_userId: { id: 'asset-stock', userId: OWNER_ID } },
    });
    expect(soldAsset?.quantity?.toNumber()).toBe(6);
    expect(soldAsset?.balance.toNumber()).toBe(300);

    const dividendResponse = await request(httpServer())
      .post('/brokerage/broker-1/dividend')
      .set('Idempotency-Key', 'dividend-1')
      .send({
        assetId: 'asset-stock',
        amount: 12.5,
        categoryId: 'income-investing',
        postedAt: '2026-05-20T11:00:00.000Z',
      })
      .expect(201);
    expect(bodyAs<BrokerageOperationResponse>(dividendResponse).kind).toBe(
      'DIVIDEND',
    );

    const feeResponse = await request(httpServer())
      .post('/brokerage/broker-1/fee')
      .set('Idempotency-Key', 'fee-1')
      .send({
        assetId: 'asset-stock',
        amount: 3,
        categoryId: 'expense-broker-fees',
        postedAt: '2026-05-20T12:00:00.000Z',
      })
      .expect(201);
    expect(bodyAs<BrokerageOperationResponse>(feeResponse).kind).toBe('FEE');

    const mirroredTransactions = await prisma.transaction.findMany({
      where: {
        userId: OWNER_ID,
        accountId: 'broker-1',
        description: {
          in: ['Brokerage dividend', 'Brokerage fee'],
        },
      },
      orderBy: { postedAt: 'asc' },
    });
    expect(mirroredTransactions).toHaveLength(2);
    expect(mirroredTransactions.map((row) => row.kind)).toEqual([
      'INCOME',
      'EXPENSE',
    ]);

    const targetResponse = await request(httpServer())
      .put('/brokerage/targets')
      .set('Idempotency-Key', 'targets-1')
      .send({
        assetKindTargets: [
          { kind: 'CASH', targetPercent: 40 },
          { kind: 'STOCK', targetPercent: 60 },
        ],
        securityTargets: [
          {
            kind: 'STOCK',
            ticker: 'VWCE',
            exchange: '.MI',
            name: 'VWCE',
            targetPercent: 100,
          },
        ],
      })
      .expect(200);
    expect(bodyAs<PortfolioAllocationTargetsResponse>(targetResponse)).toEqual({
      assetKindTargets: [
        { kind: 'CASH', targetPercent: 40 },
        { kind: 'STOCK', targetPercent: 60 },
      ],
      securityTargets: [
        {
          kind: 'STOCK',
          ticker: 'VWCE',
          exchange: '.MI',
          name: 'VWCE',
          targetPercent: 100,
        },
      ],
    });

    const persistedAssetKindTargets =
      await prisma.portfolioAssetKindTarget.findMany({
        where: { userId: OWNER_ID },
        orderBy: { kind: 'asc' },
      });
    expect(
      persistedAssetKindTargets.map((row) => ({
        kind: row.kind,
        targetPercent: row.targetPercent.toNumber(),
      })),
    ).toEqual([
      { kind: 'CASH', targetPercent: 40 },
      { kind: 'STOCK', targetPercent: 60 },
    ]);

    const workspaceResponse = await request(httpServer())
      .get('/brokerage/broker-1')
      .expect(200);
    const workspace = bodyAs<BrokerageWorkspaceResponse>(workspaceResponse);
    expect(workspace.activity.map((entry) => entry.kind)).toEqual(
      expect.arrayContaining(['BUY', 'SELL', 'DIVIDEND', 'FEE']),
    );
  });

  it('rejects sells that exceed the current position quantity', async () => {
    await seedBrokerageWorkspace();

    await request(httpServer())
      .post('/brokerage/broker-1/sell')
      .set('Idempotency-Key', 'sell-too-much')
      .send({
        assetId: 'asset-stock',
        quantity: 50,
        unitPrice: 60,
        postedAt: '2026-05-20T10:00:00.000Z',
      })
      .expect(409)
      .expect((response: ResponseWithBody) => {
        expect(bodyAs<{ message: string }>(response).message).toContain(
          'Cannot sell more than the current position quantity.',
        );
      });
  });
});
