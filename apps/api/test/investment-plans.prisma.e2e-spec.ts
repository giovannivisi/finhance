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
  CreateInvestmentPlanRequest,
  InvestmentPlanResponse,
  RecordInvestmentPlanBuyResponse,
} from '@finhance/shared';
import { createPrismaTestSchema } from './prisma-test-schema';

const OWNER_ID = 'local-dev';

type ResponseWithBody = { body: unknown };
type HttpServer = Parameters<typeof request>[0];

function bodyAs<T>(response: ResponseWithBody): T {
  return response.body as T;
}

function createPlanPayload(
  overrides: Partial<CreateInvestmentPlanRequest> = {},
): CreateInvestmentPlanRequest {
  return {
    accountId: 'broker-1',
    name: 'VWCE monthly plan',
    securityName: 'Vanguard FTSE All-World',
    securityKind: 'STOCK',
    securityTicker: 'VWCE',
    securityExchange: '.DE',
    currency: 'EUR',
    contributionAmount: 250,
    estimatedFeeAmount: 1,
    cadence: 'MONTHLY',
    dayOfMonth: 1,
    secondDayOfMonth: null,
    nextScheduledDate: '2000-01-01',
    notes: 'Keep investing.',
    ...overrides,
  };
}

jest.setTimeout(90_000);

describe('Investment plan routes with Prisma schema (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let disposeSchema: (() => Promise<void>) | undefined;

  function httpServer(): HttpServer {
    return app.getHttpServer() as HttpServer;
  }

  beforeAll(async () => {
    const schema = await createPrismaTestSchema('investment_plan_routes');
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
    await app?.close();
    await prisma?.$disconnect();
    await disposeSchema?.();
  });

  beforeEach(async () => {
    await prisma.idempotencyRequest.deleteMany();
    await prisma.investmentPlanOccurrence.deleteMany();
    await prisma.investmentPlan.deleteMany();
    await prisma.brokerageOperation.deleteMany();
    await prisma.transaction.deleteMany();
    await prisma.asset.deleteMany();
    await prisma.account.deleteMany();
  });

  async function seedBrokerAccount(): Promise<void> {
    await prisma.account.create({
      data: {
        id: 'broker-1',
        userId: OWNER_ID,
        name: 'Interactive Brokers',
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

  it('requires an idempotency key before creating a plan', async () => {
    await seedBrokerAccount();

    await request(httpServer())
      .post('/investment-plans')
      .send(createPlanPayload())
      .expect(400)
      .expect((response: ResponseWithBody) => {
        expect(bodyAs<{ message: string }>(response).message).toContain(
          'Idempotency-Key header is required.',
        );
      });

    expect(await prisma.investmentPlan.count()).toBe(0);
  });

  it('creates, lists, updates, pauses, resumes, and skips a plan', async () => {
    await seedBrokerAccount();
    const payload = createPlanPayload();

    const createResponse = await request(httpServer())
      .post('/investment-plans')
      .set('Idempotency-Key', 'investment-plan-create')
      .send(payload)
      .expect(201);
    const created = bodyAs<InvestmentPlanResponse>(createResponse);
    expect(created).toMatchObject({
      account: { id: 'broker-1', name: 'Interactive Brokers', currency: 'EUR' },
      name: payload.name,
      securityTicker: 'VWCE',
      nextScheduledDate: '2000-01-01',
      isActive: true,
      isDue: true,
    });

    const replayResponse = await request(httpServer())
      .post('/investment-plans')
      .set('Idempotency-Key', 'investment-plan-create')
      .send(payload)
      .expect(201);
    expect(bodyAs<InvestmentPlanResponse>(replayResponse)).toEqual(created);
    expect(await prisma.investmentPlan.count()).toBe(1);

    const listResponse = await request(httpServer())
      .get('/investment-plans')
      .expect(200);
    expect(bodyAs<InvestmentPlanResponse[]>(listResponse)).toEqual([created]);

    await request(httpServer())
      .get(`/investment-plans/${created.id}`)
      .expect(200)
      .expect((response: ResponseWithBody) => {
        expect(bodyAs<InvestmentPlanResponse>(response)).toEqual(created);
      });

    const updateResponse = await request(httpServer())
      .put(`/investment-plans/${created.id}`)
      .set('Idempotency-Key', 'investment-plan-update')
      .send(
        createPlanPayload({
          name: 'VWCE twice-monthly plan',
          cadence: 'TWICE_MONTHLY',
          dayOfMonth: 1,
          secondDayOfMonth: 15,
        }),
      )
      .expect(200);
    const updated = bodyAs<InvestmentPlanResponse>(updateResponse);
    expect(updated).toMatchObject({
      id: created.id,
      name: 'VWCE twice-monthly plan',
      cadence: 'TWICE_MONTHLY',
      secondDayOfMonth: 15,
    });

    const pauseResponse = await request(httpServer())
      .post(`/investment-plans/${created.id}/pause`)
      .set('Idempotency-Key', 'investment-plan-pause')
      .expect(201);
    expect(bodyAs<InvestmentPlanResponse>(pauseResponse).isActive).toBe(false);

    const resumeResponse = await request(httpServer())
      .post(`/investment-plans/${created.id}/resume`)
      .set('Idempotency-Key', 'investment-plan-resume')
      .expect(201);
    expect(bodyAs<InvestmentPlanResponse>(resumeResponse).isActive).toBe(true);

    const skipResponse = await request(httpServer())
      .post(`/investment-plans/${created.id}/skip`)
      .set('Idempotency-Key', 'investment-plan-skip')
      .expect(201);
    expect(bodyAs<InvestmentPlanResponse>(skipResponse)).toMatchObject({
      id: created.id,
      nextScheduledDate: '2000-01-15',
    });

    const occurrence = await prisma.investmentPlanOccurrence.findFirstOrThrow({
      where: { investmentPlanId: created.id },
    });
    expect(occurrence.status).toBe('SKIPPED');
    expect(occurrence.scheduledFor.toISOString().slice(0, 10)).toBe(
      '2000-01-01',
    );
  });

  it('records one confirmed due buy and replays the response without duplicating it', async () => {
    await seedBrokerAccount();

    const createResponse = await request(httpServer())
      .post('/investment-plans')
      .set('Idempotency-Key', 'investment-plan-record-create')
      .send(
        createPlanPayload({
          name: 'SXR8 monthly plan',
          securityTicker: 'SXR8',
        }),
      )
      .expect(201);
    const plan = bodyAs<InvestmentPlanResponse>(createResponse);
    const recordPayload = {
      quantity: 2,
      unitPrice: 100,
      feeAmount: 1,
      postedAt: '2026-08-05T09:00:00.000Z',
      notes: 'Executed at market open.',
    };

    const recordResponse = await request(httpServer())
      .post(`/investment-plans/${plan.id}/record-buy`)
      .set('Idempotency-Key', 'investment-plan-record-buy')
      .send(recordPayload)
      .expect(201);
    const recorded = bodyAs<RecordInvestmentPlanBuyResponse>(recordResponse);
    expect(recorded).toMatchObject({
      plan: {
        id: plan.id,
        nextScheduledDate: '2000-02-01',
      },
      operation: {
        kind: 'BUY',
        accountId: 'broker-1',
        quantity: 2,
        unitPrice: 100,
        grossAmount: 200,
        feeAmount: 1,
        cashAmount: -201,
      },
    });

    const replayResponse = await request(httpServer())
      .post(`/investment-plans/${plan.id}/record-buy`)
      .set('Idempotency-Key', 'investment-plan-record-buy')
      .send(recordPayload)
      .expect(201);
    expect(bodyAs<RecordInvestmentPlanBuyResponse>(replayResponse)).toEqual(
      recorded,
    );

    expect(await prisma.brokerageOperation.count()).toBe(1);
    const occurrence = await prisma.investmentPlanOccurrence.findFirstOrThrow({
      where: { investmentPlanId: plan.id },
    });
    expect(occurrence).toMatchObject({
      status: 'COMPLETED',
      brokerageOperationId: recorded.operation.id,
    });

    const cashAsset = await prisma.asset.findUniqueOrThrow({
      where: { id_userId: { id: 'broker-cash', userId: OWNER_ID } },
    });
    expect(cashAsset.balance.toNumber()).toBe(799);
  });
});
