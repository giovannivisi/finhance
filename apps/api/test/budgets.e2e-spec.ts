import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { RequestOwnerResolver } from '@/security/request-owner.resolver';
import { BudgetsController } from '@budgets/budgets.controller';
import { BudgetsService } from '@budgets/budgets.service';
import type {
  CategoryBudgetOverrideResponse,
  CategoryBudgetResponse,
  MonthlyBudgetResponse,
} from '@finhance/shared';

const OWNER_ID = 'local-dev';
type ResponseWithBody = { body: unknown };
type HttpServer = Parameters<typeof request>[0];

function bodyAs<T>(response: ResponseWithBody): T {
  return response.body as T;
}

describe('Budget routes (e2e)', () => {
  let app: INestApplication;
  let budgets: {
    findMonthly: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
    remove: jest.Mock;
    findOverrides: jest.Mock;
    upsertOverride: jest.Mock;
    clearOverride: jest.Mock;
  };

  function httpServer(): HttpServer {
    return app.getHttpServer() as HttpServer;
  }

  beforeEach(async () => {
    budgets = {
      findMonthly: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      remove: jest.fn(),
      findOverrides: jest.fn(),
      upsertOverride: jest.fn(),
      clearOverride: jest.fn(),
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [BudgetsController],
      providers: [
        { provide: BudgetsService, useValue: budgets },
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

  it('returns the resolved monthly budget view through GET /budgets', async () => {
    budgets.findMonthly.mockResolvedValue({
      month: '2026-04',
      includeArchivedCategories: false,
      currencies: [
        {
          currency: 'EUR',
          budgetTotal: 100,
          spentTotal: 80,
          remainingTotal: 20,
          overBudgetTotal: 0,
          overBudgetCount: 0,
          budgetedCategoryCount: 1,
          unbudgetedExpenseTotal: 0,
          uncategorizedExpenseTotal: 0,
          items: [],
          overBudgetHighlights: [],
          unbudgetedCategories: [],
        },
      ],
    } satisfies MonthlyBudgetResponse);

    await request(httpServer())
      .get('/budgets?month=2026-04')
      .expect(200)
      .expect((response: ResponseWithBody) => {
        expect(bodyAs<MonthlyBudgetResponse>(response).month).toBe('2026-04');
      });
  });

  it('creates budgets through POST /budgets', async () => {
    budgets.create.mockResolvedValue({
      id: 'budget-1',
      categoryId: 'category-1',
      categoryName: 'Groceries',
      categoryArchivedAt: null,
      currency: 'EUR',
      amount: 100,
      startMonth: '2026-04',
      endMonth: null,
      createdAt: '2026-04-23T10:00:00.000Z',
      updatedAt: '2026-04-23T10:00:00.000Z',
    } satisfies CategoryBudgetResponse);

    await request(httpServer())
      .post('/budgets')
      .send({
        categoryId: 'category-1',
        currency: 'EUR',
        amount: 100,
        startMonth: '2026-04',
      })
      .expect(201)
      .expect((response: ResponseWithBody) => {
        expect(bodyAs<CategoryBudgetResponse>(response).categoryName).toBe(
          'Groceries',
        );
      });
  });

  it('updates month overrides through PUT /budgets/:id/overrides/:month', async () => {
    budgets.upsertOverride.mockResolvedValue({
      id: 'override-1',
      categoryBudgetId: 'budget-1',
      month: '2026-04',
      amount: 120,
      note: 'Trip month',
      createdAt: '2026-04-23T10:00:00.000Z',
      updatedAt: '2026-04-23T10:00:00.000Z',
    } satisfies CategoryBudgetOverrideResponse);

    await request(httpServer())
      .put('/budgets/budget-1/overrides/2026-04')
      .send({
        amount: 120,
        note: 'Trip month',
      })
      .expect(200)
      .expect((response: ResponseWithBody) => {
        expect(bodyAs<CategoryBudgetOverrideResponse>(response).amount).toBe(
          120,
        );
      });
  });

  it('rejects invalid month query formats for GET /budgets', async () => {
    await request(httpServer()).get('/budgets?month=2026-04-01').expect(400);
    await request(httpServer())
      .delete('/budgets/budget-1?effectiveMonth=2026/04')
      .expect(400);
    await request(httpServer())
      .get('/budgets/budget-1/overrides?from=2026-04-01&to=2026-05')
      .expect(400);
  });
});
