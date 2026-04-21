import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { RequestOwnerResolver } from '@/security/request-owner.resolver';
import { MonthlyReviewController } from '@recurring/monthly-review.controller';
import { RecurringController } from '@recurring/recurring.controller';
import { RecurringService } from '@recurring/recurring.service';
import { Prisma, TransactionDirection, TransactionKind } from '@prisma/client';
import type {
  MaterializeRecurringRulesResponse,
  MonthlyReviewResponse,
  RecurringTransactionRuleResponse,
} from '@finhance/shared';

const OWNER_ID = 'local-dev';
type ResponseWithBody = { body: unknown };
type HttpServer = Parameters<typeof request>[0];

function bodyAs<T>(response: ResponseWithBody): T {
  return response.body as T;
}

function createRuleModel(overrides: Partial<Record<string, unknown>> = {}) {
  const now = new Date('2026-04-21T10:00:00.000Z');

  return {
    id: 'rule-1',
    userId: OWNER_ID,
    name: 'Salary',
    isActive: true,
    kind: TransactionKind.INCOME,
    amount: new Prisma.Decimal('1000'),
    dayOfMonth: 15,
    startDate: new Date('2026-04-01T00:00:00.000Z'),
    endDate: null,
    accountId: 'account-1',
    direction: TransactionDirection.INFLOW,
    categoryId: 'category-1',
    counterparty: 'Employer',
    sourceAccountId: null,
    destinationAccountId: null,
    description: 'Monthly salary',
    notes: null,
    lastMaterializationError: null,
    lastMaterializationErrorAt: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe('Recurring routes (e2e)', () => {
  let app: INestApplication;
  let recurring: {
    findAll: jest.Mock;
    findOne: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
    remove: jest.Mock;
    materialize: jest.Mock;
    getMonthlyReview: jest.Mock;
  };

  function httpServer(): HttpServer {
    return app.getHttpServer() as HttpServer;
  }

  beforeEach(async () => {
    recurring = {
      findAll: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      remove: jest.fn(),
      materialize: jest.fn(),
      getMonthlyReview: jest.fn(),
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [RecurringController, MonthlyReviewController],
      providers: [
        { provide: RecurringService, useValue: recurring },
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

  it('returns recurring rules through GET /recurring-rules', async () => {
    recurring.findAll.mockResolvedValue([createRuleModel()]);

    await request(httpServer())
      .get('/recurring-rules')
      .expect(200)
      .expect((response: ResponseWithBody) => {
        const body = bodyAs<RecurringTransactionRuleResponse[]>(response);
        expect(body[0]?.name).toBe('Salary');
      });
  });

  it('creates recurring rules through POST /recurring-rules', async () => {
    recurring.create.mockResolvedValue(createRuleModel());

    await request(httpServer())
      .post('/recurring-rules')
      .send({
        name: 'Salary',
        kind: 'INCOME',
        amount: 1000,
        dayOfMonth: 15,
        startDate: '2026-04-01',
        accountId: 'account-1',
        direction: 'INFLOW',
        description: 'Monthly salary',
      })
      .expect(201)
      .expect((response: ResponseWithBody) => {
        expect(bodyAs<RecurringTransactionRuleResponse>(response).kind).toBe(
          'INCOME',
        );
      });
  });

  it('returns materialization counts through POST /recurring-rules/materialize', async () => {
    recurring.materialize.mockResolvedValue({
      createdCount: 2,
      processedRuleCount: 1,
      failedRuleCount: 0,
    } satisfies MaterializeRecurringRulesResponse);

    await request(httpServer())
      .post('/recurring-rules/materialize')
      .expect(201)
      .expect((response: ResponseWithBody) => {
        expect(
          bodyAs<MaterializeRecurringRulesResponse>(response).createdCount,
        ).toBe(2);
      });
  });

  it('returns monthly review data through GET /monthly-review', async () => {
    recurring.getMonthlyReview.mockResolvedValue({
      month: '2026-04',
      cashflow: [],
      openingNetWorth: 1000,
      closingNetWorth: 1200,
      netWorthDelta: 200,
      openingSnapshotDate: '2026-03-31',
      closingSnapshotDate: '2026-04-30',
      reconciliationHighlights: [],
    } satisfies MonthlyReviewResponse);

    await request(httpServer())
      .get('/monthly-review?month=2026-04')
      .expect(200)
      .expect((response: ResponseWithBody) => {
        expect(bodyAs<MonthlyReviewResponse>(response).netWorthDelta).toBe(200);
      });
  });
});
