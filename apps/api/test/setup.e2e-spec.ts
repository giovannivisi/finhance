import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { RequestOwnerResolver } from '@/security/request-owner.resolver';
import { SetupController } from '@/setup/setup.controller';
import { SetupService } from '@/setup/setup.service';
import { AccountsService } from '@accounts/accounts.service';
import { PrismaService } from '@prisma/prisma.service';

const OWNER_ID = 'local-dev';
type ResponseWithBody = { body: unknown };
type HttpServer = Parameters<typeof request>[0];

function bodyAs<T>(response: ResponseWithBody): T {
  return response.body as T;
}

describe('Setup routes (e2e)', () => {
  let app: INestApplication;
  let prisma: {
    account: { count: jest.Mock };
    category: { findMany: jest.Mock };
    recurringTransactionRule: { count: jest.Mock };
    categoryBudget: { count: jest.Mock };
    importBatch: { count: jest.Mock };
    netWorthSnapshot: { findFirst: jest.Mock };
  };
  let accounts: {
    findReconciliation: jest.Mock;
  };

  function httpServer(): HttpServer {
    return app.getHttpServer() as HttpServer;
  }

  beforeEach(async () => {
    prisma = {
      account: { count: jest.fn().mockResolvedValue(0) },
      category: { findMany: jest.fn().mockResolvedValue([]) },
      recurringTransactionRule: { count: jest.fn().mockResolvedValue(0) },
      categoryBudget: { count: jest.fn().mockResolvedValue(0) },
      importBatch: { count: jest.fn().mockResolvedValue(0) },
      netWorthSnapshot: { findFirst: jest.fn().mockResolvedValue(null) },
    };

    accounts = {
      findReconciliation: jest.fn().mockResolvedValue([]),
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [SetupController],
      providers: [
        SetupService,
        { provide: PrismaService, useValue: prisma },
        { provide: AccountsService, useValue: accounts },
        {
          provide: RequestOwnerResolver,
          useValue: {
            resolveOwnerId: () => OWNER_ID,
          },
        },
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    if (app) {
      await app.close();
    }
  });

  it('returns a derived setup checklist from GET /setup/status', async () => {
    prisma.account.count.mockResolvedValue(1);
    prisma.category.findMany.mockResolvedValue([
      { type: 'INCOME' },
      { type: 'EXPENSE' },
    ]);
    prisma.recurringTransactionRule.count.mockResolvedValue(1);
    prisma.categoryBudget.count.mockResolvedValue(1);
    prisma.importBatch.count.mockResolvedValue(1);
    prisma.netWorthSnapshot.findFirst.mockResolvedValue({ id: 'snapshot-1' });

    await request(httpServer())
      .get('/setup/status')
      .expect(200)
      .expect((response: ResponseWithBody) => {
        const body = bodyAs<{
          isComplete: boolean;
          requiredSteps: Array<{ code: string; status: string }>;
          recommendedSteps: Array<{ code: string; status: string }>;
          hasAppliedImportBatch: boolean;
          hasSnapshot: boolean;
        }>(response);

        expect(body.isComplete).toBe(true);
        expect(
          body.requiredSteps.map((step) => [step.code, step.status]),
        ).toEqual([
          ['ACCOUNTS', 'COMPLETE'],
          ['CATEGORIES', 'COMPLETE'],
        ]);
        expect(
          body.recommendedSteps.map((step) => [step.code, step.status]),
        ).toEqual([
          ['RECURRING', 'COMPLETE'],
          ['BUDGETS', 'COMPLETE'],
        ]);
        expect(body.hasAppliedImportBatch).toBe(true);
        expect(body.hasSnapshot).toBe(true);
      });
  });
});
