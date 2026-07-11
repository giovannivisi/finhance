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
import type { AccountReconciliationResponse } from '@finhance/shared';
import { createPrismaTestSchema } from './prisma-test-schema';

const OWNER_ID = 'local-dev';

type ResponseWithBody = { body: unknown };
type HttpServer = Parameters<typeof request>[0];

function bodyAs<T>(response: ResponseWithBody): T {
  return response.body as T;
}

jest.setTimeout(90_000);

describe('Account reconciliation invariants with Prisma schema (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let disposeSchema: (() => Promise<void>) | undefined;

  function httpServer(): HttpServer {
    return app.getHttpServer() as HttpServer;
  }

  async function getReconciliation(
    accountId: string,
  ): Promise<AccountReconciliationResponse> {
    const response = await request(httpServer())
      .get('/accounts/reconciliation')
      .expect(200);
    const entries = bodyAs<AccountReconciliationResponse[]>(response);
    const entry = entries.find((item) => item.accountId === accountId);
    expect(entry).toBeDefined();
    return entry!;
  }

  beforeAll(async () => {
    const schema = await createPrismaTestSchema('reconciliation_invariants');
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
        getStoredFxRateSnapshot: jest.fn((_: string, date: Date) =>
          Promise.resolve({
            rate: new Prisma.Decimal(1),
            status: 'EXACT',
            source: null,
            rateDate: date.toISOString().slice(0, 10),
            updatedAt: date,
          }),
        ),
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
    await prisma.transaction.deleteMany();
    await prisma.asset.deleteMany();
    await prisma.account.deleteMany();
    await prisma.category.deleteMany();
  });

  async function seedCategories() {
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
          id: 'expense-lifestyle',
          userId: OWNER_ID,
          name: 'Lifestyle',
          type: 'EXPENSE',
          order: 0,
        },
        {
          id: 'expense-shopping',
          userId: OWNER_ID,
          name: 'Shopping',
          type: 'EXPENSE',
          parentCategoryId: 'expense-lifestyle',
          order: 0,
        },
      ],
    });
  }

  async function seedBrokerAccount() {
    await prisma.account.create({
      data: {
        id: 'broker-1',
        userId: OWNER_ID,
        name: 'Trade Republic',
        type: 'BROKER',
        currency: 'EUR',
        openingBalance: new Prisma.Decimal('1000'),
      },
    });

    await prisma.asset.create({
      data: {
        id: 'broker-cash',
        userId: OWNER_ID,
        accountId: 'broker-1',
        name: 'Broker cash',
        type: 'ASSET',
        kind: 'CASH',
        balance: new Prisma.Decimal('1000'),
        currency: 'EUR',
      },
    });
  }

  async function seedCheckingAccount() {
    await prisma.account.create({
      data: {
        id: 'checking-1',
        userId: OWNER_ID,
        name: 'Checking',
        type: 'BANK',
        currency: 'EUR',
        openingBalance: new Prisma.Decimal('500'),
      },
    });

    await prisma.asset.create({
      data: {
        id: 'checking-cash',
        userId: OWNER_ID,
        accountId: 'checking-1',
        name: 'Checking cash',
        type: 'ASSET',
        kind: 'CASH',
        balance: new Prisma.Decimal('500'),
        currency: 'EUR',
      },
    });
  }

  async function seedCardAccount() {
    await prisma.account.create({
      data: {
        id: 'card-1',
        userId: OWNER_ID,
        name: 'Amex',
        type: 'CARD',
        currency: 'EUR',
        openingBalance: new Prisma.Decimal('0'),
      },
    });
  }

  describe('broker accounts (PAC / stock purchases)', () => {
    it('stays clean through a full buy, sell, dividend, and fee cycle', async () => {
      await seedCategories();
      await seedBrokerAccount();

      const baseline = await getReconciliation('broker-1');
      expect(baseline).toMatchObject({
        status: 'CLEAN',
        reconciliationScope: 'CASH_ONLY',
        trackedBalance: 1000,
        expectedBalance: 1000,
        delta: 0,
      });

      await request(httpServer())
        .post('/brokerage/broker-1/buy')
        .set('Idempotency-Key', 'recon-buy-1')
        .send({
          name: 'VWCE',
          kind: 'STOCK',
          ticker: 'VWCE',
          exchange: '.MI',
          currency: 'EUR',
          quantity: 2,
          unitPrice: 100,
          feeAmount: 1,
          postedAt: '2026-06-01T09:00:00.000Z',
        })
        .expect(201);

      const afterBuy = await getReconciliation('broker-1');
      expect(afterBuy).toMatchObject({
        status: 'CLEAN',
        trackedBalance: 799,
        expectedBalance: 799,
        delta: 0,
      });

      const boughtAsset = await prisma.asset.findFirst({
        where: { userId: OWNER_ID, ticker: 'VWCE', accountId: 'broker-1' },
      });
      expect(boughtAsset).not.toBeNull();

      await request(httpServer())
        .post('/brokerage/broker-1/sell')
        .set('Idempotency-Key', 'recon-sell-1')
        .send({
          assetId: boughtAsset!.id,
          quantity: 1,
          unitPrice: 60,
          feeAmount: 2,
          postedAt: '2026-06-02T09:00:00.000Z',
        })
        .expect(201);

      const afterSell = await getReconciliation('broker-1');
      expect(afterSell).toMatchObject({
        status: 'CLEAN',
        trackedBalance: 857,
        expectedBalance: 857,
        delta: 0,
      });

      await request(httpServer())
        .post('/brokerage/broker-1/dividend')
        .set('Idempotency-Key', 'recon-dividend-1')
        .send({
          assetId: boughtAsset!.id,
          amount: 12.5,
          categoryId: 'income-investing',
          postedAt: '2026-06-03T09:00:00.000Z',
        })
        .expect(201);

      await request(httpServer())
        .post('/brokerage/broker-1/fee')
        .set('Idempotency-Key', 'recon-fee-1')
        .send({
          assetId: boughtAsset!.id,
          amount: 3,
          categoryId: 'expense-shopping',
          postedAt: '2026-06-04T09:00:00.000Z',
        })
        .expect(201);

      const afterCycle = await getReconciliation('broker-1');
      expect(afterCycle).toMatchObject({
        status: 'CLEAN',
        trackedBalance: 866.5,
        expectedBalance: 866.5,
        delta: 0,
      });
    });

    it('stays clean when positions are edited manually after a cash outflow (manual PAC workflow)', async () => {
      await seedCategories();
      await seedBrokerAccount();

      await request(httpServer())
        .post('/transactions')
        .set('Idempotency-Key', 'recon-txn-1')
        .send({
          postedAt: '2026-06-01T09:00:00.000Z',
          kind: 'ADJUSTMENT',
          amount: 100,
          description: 'Manual PAC outflow',
          accountId: 'broker-1',
          direction: 'OUTFLOW',
        })
        .expect(201);

      // ADJUSTMENT transactions intentionally leave assets untouched, so the
      // manual workflow also hand-edits the cash asset before adding shares.
      await prisma.asset.update({
        where: { id_userId: { id: 'broker-cash', userId: OWNER_ID } },
        data: { balance: new Prisma.Decimal('900') },
      });

      await prisma.asset.create({
        data: {
          id: 'manual-stock',
          userId: OWNER_ID,
          accountId: 'broker-1',
          name: 'SWDA',
          type: 'ASSET',
          kind: 'STOCK',
          ticker: 'SWDA',
          exchange: '.MI',
          quantity: new Prisma.Decimal('1'),
          unitPrice: new Prisma.Decimal('100'),
          balance: new Prisma.Decimal('100'),
          currency: 'EUR',
        },
      });

      const afterManualBuy = await getReconciliation('broker-1');
      expect(afterManualBuy).toMatchObject({
        status: 'CLEAN',
        reconciliationScope: 'CASH_ONLY',
        trackedBalance: 900,
        expectedBalance: 900,
        delta: 0,
      });

      // Later market movements edited by hand must not affect cash-only
      // reconciliation either.
      await prisma.asset.update({
        where: { id_userId: { id: 'manual-stock', userId: OWNER_ID } },
        data: {
          quantity: new Prisma.Decimal('2'),
          unitPrice: new Prisma.Decimal('120'),
          balance: new Prisma.Decimal('240'),
        },
      });

      const afterMarketEdit = await getReconciliation('broker-1');
      expect(afterMarketEdit).toMatchObject({
        status: 'CLEAN',
        trackedBalance: 900,
        expectedBalance: 900,
        delta: 0,
      });
    });

    it('still mismatches when market assets live in a non-broker account', async () => {
      await seedCheckingAccount();

      await prisma.asset.create({
        data: {
          id: 'checking-stock',
          userId: OWNER_ID,
          accountId: 'checking-1',
          name: 'VWCE',
          type: 'ASSET',
          kind: 'STOCK',
          ticker: 'VWCE',
          exchange: '.MI',
          quantity: new Prisma.Decimal('10'),
          unitPrice: new Prisma.Decimal('50'),
          balance: new Prisma.Decimal('500'),
          currency: 'EUR',
        },
      });

      // openingBalance only covers the cash asset, so the stock value has no
      // matching transaction history: the pre-brokerage PAC mismatch remains.
      const reconciliation = await getReconciliation('checking-1');
      expect(reconciliation).toMatchObject({
        status: 'MISMATCH',
        reconciliationScope: 'FULL_BALANCE',
        trackedBalance: 1000,
        expectedBalance: 500,
        delta: 500,
      });
    });
  });

  describe('card accounts (liability routing)', () => {
    it('auto-creates the liability asset on the first card expense and stays clean', async () => {
      await seedCategories();
      await seedCardAccount();

      await request(httpServer())
        .post('/transactions')
        .set('Idempotency-Key', 'recon-txn-2')
        .send({
          postedAt: '2026-06-01T09:00:00.000Z',
          kind: 'EXPENSE',
          amount: 50,
          description: 'Card groceries',
          accountId: 'card-1',
          direction: 'OUTFLOW',
          categoryId: 'expense-shopping',
        })
        .expect(201);

      const liability = await prisma.asset.findFirst({
        where: { userId: OWNER_ID, accountId: 'card-1', type: 'LIABILITY' },
      });
      expect(liability).toMatchObject({
        name: 'Amex Debt',
        liabilityKind: 'DEBT',
      });
      expect(liability?.balance.toNumber()).toBe(50);

      const reconciliation = await getReconciliation('card-1');
      expect(reconciliation).toMatchObject({
        status: 'CLEAN',
        trackedBalance: -50,
        expectedBalance: -50,
        delta: 0,
      });
    });

    it('keeps both accounts clean through a card payment transfer', async () => {
      await seedCategories();
      await seedCardAccount();
      await seedCheckingAccount();

      await request(httpServer())
        .post('/transactions')
        .set('Idempotency-Key', 'recon-txn-3')
        .send({
          postedAt: '2026-06-01T09:00:00.000Z',
          kind: 'EXPENSE',
          amount: 50,
          description: 'Card groceries',
          accountId: 'card-1',
          direction: 'OUTFLOW',
          categoryId: 'expense-shopping',
        })
        .expect(201);

      await request(httpServer())
        .post('/transactions')
        .set('Idempotency-Key', 'recon-txn-4')
        .send({
          postedAt: '2026-06-05T09:00:00.000Z',
          kind: 'TRANSFER',
          amount: 30,
          description: 'Card payment',
          sourceAccountId: 'checking-1',
          destinationAccountId: 'card-1',
        })
        .expect(201);

      const liability = await prisma.asset.findFirst({
        where: { userId: OWNER_ID, accountId: 'card-1', type: 'LIABILITY' },
      });
      expect(liability?.balance.toNumber()).toBe(20);

      const checkingCash = await prisma.asset.findUnique({
        where: { id_userId: { id: 'checking-cash', userId: OWNER_ID } },
      });
      expect(checkingCash?.balance.toNumber()).toBe(470);

      const cardReconciliation = await getReconciliation('card-1');
      expect(cardReconciliation).toMatchObject({
        status: 'CLEAN',
        trackedBalance: -20,
        expectedBalance: -20,
        delta: 0,
      });

      const checkingReconciliation = await getReconciliation('checking-1');
      expect(checkingReconciliation).toMatchObject({
        status: 'CLEAN',
        trackedBalance: 470,
        expectedBalance: 470,
        delta: 0,
      });
    });

    it('rejects card payments when no liability exists yet', async () => {
      await seedCardAccount();
      await seedCheckingAccount();

      await request(httpServer())
        .post('/transactions')
        .set('Idempotency-Key', 'recon-txn-5')
        .send({
          postedAt: '2026-06-05T09:00:00.000Z',
          kind: 'TRANSFER',
          amount: 30,
          description: 'Card payment',
          sourceAccountId: 'checking-1',
          destinationAccountId: 'card-1',
        })
        .expect(400)
        .expect((response: ResponseWithBody) => {
          expect(bodyAs<{ message: string }>(response).message).toContain(
            'no liability to pay off',
          );
        });

      // The failed transfer must not leave partial state behind.
      expect(await prisma.transaction.count()).toBe(0);
      const checkingCash = await prisma.asset.findUnique({
        where: { id_userId: { id: 'checking-cash', userId: OWNER_ID } },
      });
      expect(checkingCash?.balance.toNumber()).toBe(500);
    });

    it('documents that over-paying a card drives the liability negative but stays clean', async () => {
      await seedCategories();
      await seedCardAccount();
      await seedCheckingAccount();

      await request(httpServer())
        .post('/transactions')
        .set('Idempotency-Key', 'recon-txn-6')
        .send({
          postedAt: '2026-06-01T09:00:00.000Z',
          kind: 'EXPENSE',
          amount: 50,
          description: 'Card groceries',
          accountId: 'card-1',
          direction: 'OUTFLOW',
          categoryId: 'expense-shopping',
        })
        .expect(201);

      await request(httpServer())
        .post('/transactions')
        .set('Idempotency-Key', 'recon-txn-7')
        .send({
          postedAt: '2026-06-05T09:00:00.000Z',
          kind: 'TRANSFER',
          amount: 80,
          description: 'Card over-payment',
          sourceAccountId: 'checking-1',
          destinationAccountId: 'card-1',
        })
        .expect(201);

      const liability = await prisma.asset.findFirst({
        where: { userId: OWNER_ID, accountId: 'card-1', type: 'LIABILITY' },
      });
      expect(liability?.balance.toNumber()).toBe(-30);

      const reconciliation = await getReconciliation('card-1');
      expect(reconciliation).toMatchObject({
        status: 'CLEAN',
        trackedBalance: 30,
        expectedBalance: 30,
        delta: 0,
      });
    });

    it('models pre-existing card debt with a negative opening balance', async () => {
      await prisma.account.create({
        data: {
          id: 'card-legacy',
          userId: OWNER_ID,
          name: 'Legacy card',
          type: 'CARD',
          currency: 'EUR',
          openingBalance: new Prisma.Decimal('-100'),
        },
      });

      await prisma.asset.create({
        data: {
          id: 'card-legacy-debt',
          userId: OWNER_ID,
          accountId: 'card-legacy',
          name: 'Legacy card Debt',
          type: 'LIABILITY',
          liabilityKind: 'DEBT',
          balance: new Prisma.Decimal('100'),
          currency: 'EUR',
        },
      });

      const reconciliation = await getReconciliation('card-legacy');
      expect(reconciliation).toMatchObject({
        status: 'CLEAN',
        trackedBalance: -100,
        expectedBalance: -100,
        delta: 0,
      });
    });
  });
});
