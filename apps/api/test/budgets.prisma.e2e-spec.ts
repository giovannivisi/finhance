import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { RequestOwnerResolver } from '@/security/request-owner.resolver';
import { BudgetsController } from '@budgets/budgets.controller';
import { BudgetsService } from '@budgets/budgets.service';
import { PrismaService } from '@prisma/prisma.service';
import { CategoriesService } from '@transactions/categories.service';
import type {
  CategoryBudgetOverrideResponse,
  CategoryBudgetResponse,
  MonthlyBudgetResponse,
} from '@finhance/shared';
import { createPrismaTestSchema } from './prisma-test-schema';

const OWNER_ID = 'local-dev';
type ResponseWithBody = { body: unknown };
type HttpServer = Parameters<typeof request>[0];

function bodyAs<T>(response: ResponseWithBody): T {
  return response.body as T;
}

jest.setTimeout(60_000);

describe('Budget routes with Prisma schema (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let disposeSchema: (() => Promise<void>) | undefined;

  function httpServer(): HttpServer {
    return app.getHttpServer() as HttpServer;
  }

  beforeAll(async () => {
    const schema = await createPrismaTestSchema('budget_routes');
    disposeSchema = async () => schema.dispose();
    process.env.DATABASE_URL = schema.databaseUrl;

    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [BudgetsController],
      providers: [
        BudgetsService,
        CategoriesService,
        PrismaService,
        RequestOwnerResolver,
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

    prisma = new PrismaClient({
      datasources: {
        db: {
          url: schema.databaseUrl,
        },
      },
    });
    await prisma.$connect();
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
    await disposeSchema?.();
  });

  beforeEach(async () => {
    await prisma.categoryBudgetOverride.deleteMany();
    await prisma.categoryBudget.deleteMany();
    await prisma.transaction.deleteMany();
    await prisma.account.deleteMany();
    await prisma.category.deleteMany();
  });

  async function seedBudgetWorkspace() {
    await prisma.account.create({
      data: {
        id: 'account-1',
        userId: OWNER_ID,
        name: 'Checking',
        type: 'BANK',
        currency: 'EUR',
      },
    });

    await prisma.category.createMany({
      data: [
        {
          id: 'category-groceries',
          userId: OWNER_ID,
          name: 'Groceries',
          type: 'EXPENSE',
          order: 0,
        },
        {
          id: 'category-dining',
          userId: OWNER_ID,
          name: 'Dining',
          type: 'EXPENSE',
          order: 1,
        },
      ],
    });

    await prisma.transaction.createMany({
      data: [
        {
          id: 'tx-1',
          userId: OWNER_ID,
          postedAt: new Date('2026-04-10T10:00:00.000Z'),
          amount: 80,
          currency: 'EUR',
          kind: 'EXPENSE',
          direction: 'OUTFLOW',
          accountId: 'account-1',
          categoryId: 'category-groceries',
          description: 'Groceries',
        },
        {
          id: 'tx-2',
          userId: OWNER_ID,
          postedAt: new Date('2026-04-11T10:00:00.000Z'),
          amount: 48,
          currency: 'EUR',
          kind: 'EXPENSE',
          direction: 'OUTFLOW',
          accountId: 'account-1',
          categoryId: 'category-dining',
          description: 'Dining',
        },
        {
          id: 'tx-3',
          userId: OWNER_ID,
          postedAt: new Date('2026-04-12T10:00:00.000Z'),
          amount: 15,
          currency: 'EUR',
          kind: 'EXPENSE',
          direction: 'OUTFLOW',
          accountId: 'account-1',
          categoryId: null,
          description: 'Unknown expense',
        },
      ],
    });
  }

  it('creates budgets and computes the monthly workspace from real tables', async () => {
    await seedBudgetWorkspace();

    const createResponse = await request(httpServer())
      .post('/budgets')
      .send({
        categoryId: 'category-groceries',
        currency: 'EUR',
        amount: 100,
        startMonth: '2026-04',
      })
      .expect(201);

    const budget = bodyAs<CategoryBudgetResponse>(createResponse);
    expect(budget.categoryName).toBe('Groceries');

    const monthlyResponse = await request(httpServer())
      .get('/budgets?month=2026-04')
      .expect(200);

    const monthly = bodyAs<MonthlyBudgetResponse>(monthlyResponse);
    expect(monthly.currencies).toHaveLength(1);
    expect(monthly.currencies[0]).toMatchObject({
      currency: 'EUR',
      budgetTotal: 100,
      spentTotal: 80,
      remainingTotal: 20,
      unbudgetedExpenseTotal: 48,
      uncategorizedExpenseTotal: 15,
    });
    expect(monthly.currencies[0].items[0]).toMatchObject({
      categoryName: 'Groceries',
      budgetAmount: 100,
      spentAmount: 80,
    });
    expect(monthly.currencies[0].unbudgetedCategories[0]).toMatchObject({
      categoryName: 'Dining',
      spentAmount: 48,
    });
  });

  it('persists month overrides in the dedicated override table', async () => {
    await seedBudgetWorkspace();

    const createResponse = await request(httpServer())
      .post('/budgets')
      .send({
        categoryId: 'category-groceries',
        currency: 'EUR',
        amount: 100,
        startMonth: '2026-04',
      })
      .expect(201);

    const budget = bodyAs<CategoryBudgetResponse>(createResponse);

    const overrideResponse = await request(httpServer())
      .put(`/budgets/${budget.id}/overrides/2026-04`)
      .send({
        amount: 120,
        note: 'Travel month',
      })
      .expect(200);

    expect(
      bodyAs<CategoryBudgetOverrideResponse>(overrideResponse),
    ).toMatchObject({
      categoryBudgetId: budget.id,
      month: '2026-04',
      amount: 120,
      note: 'Travel month',
    });

    const overridesResponse = await request(httpServer())
      .get(`/budgets/${budget.id}/overrides?from=2026-04&to=2026-04`)
      .expect(200);

    expect(
      bodyAs<CategoryBudgetOverrideResponse[]>(overridesResponse),
    ).toHaveLength(1);

    const monthlyResponse = await request(httpServer())
      .get('/budgets?month=2026-04')
      .expect(200);

    const monthly = bodyAs<MonthlyBudgetResponse>(monthlyResponse);
    expect(monthly.currencies[0].items[0]).toMatchObject({
      budgetAmount: 120,
      spentAmount: 80,
      override: {
        month: '2026-04',
        amount: 120,
        note: 'Travel month',
      },
    });
  });
});
