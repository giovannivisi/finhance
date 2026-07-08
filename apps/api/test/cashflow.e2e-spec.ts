import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AccountsService } from '@accounts/accounts.service';
import { RequestOwnerResolver } from '@/security/request-owner.resolver';
import { SetupService } from '@/setup/setup.service';
import { CashflowController } from '@transactions/cashflow.controller';
import { CategoriesService } from '@transactions/categories.service';
import { TransactionsService } from '@transactions/transactions.service';
import type {
  CashflowAnalyticsResponse,
  CashflowSummaryResponse,
  MonthlyCashflowResponse,
} from '@finhance/shared';

const OWNER_ID = 'local-dev';
type ResponseWithBody = { body: unknown };
type HttpServer = Parameters<typeof request>[0];

function bodyAs<T>(response: ResponseWithBody): T {
  return response.body as T;
}

describe('Cashflow routes (e2e)', () => {
  let app: INestApplication;
  let transactions: {
    getMonthlyCashflow: jest.Mock;
    getCashflowAnalytics: jest.Mock;
    getCashflowSummary: jest.Mock;
  };
  let accounts: {
    findAll: jest.Mock;
    getDeletionStates: jest.Mock;
  };
  let categories: {
    findAll: jest.Mock;
    getDeletionStates: jest.Mock;
  };
  let setup: {
    getStatus: jest.Mock;
  };

  function httpServer(): HttpServer {
    return app.getHttpServer() as HttpServer;
  }

  beforeEach(async () => {
    transactions = {
      getMonthlyCashflow: jest.fn(),
      getCashflowAnalytics: jest.fn(),
      getCashflowSummary: jest.fn(),
    };
    accounts = {
      findAll: jest.fn().mockResolvedValue([]),
      getDeletionStates: jest.fn().mockResolvedValue(new Map()),
    };
    categories = {
      findAll: jest.fn().mockResolvedValue([]),
      getDeletionStates: jest.fn().mockResolvedValue(new Map()),
    };
    setup = {
      getStatus: jest.fn().mockResolvedValue(null),
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [CashflowController],
      providers: [
        { provide: AccountsService, useValue: accounts },
        { provide: CategoriesService, useValue: categories },
        { provide: SetupService, useValue: setup },
        { provide: TransactionsService, useValue: transactions },
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

  it('returns monthly cashflow and preserves repeated account filters', async () => {
    transactions.getMonthlyCashflow.mockResolvedValue([
      {
        currency: 'EUR',
        averageMonthlyExpense: 0,
        rangeExpenseCategories: [],
        months: [],
      },
    ] satisfies MonthlyCashflowResponse);

    await request(httpServer())
      .get(
        '/cashflow/monthly?from=2026-01&to=2026-03&accountId=acc-1&accountId=acc-2&includeArchivedAccounts=true',
      )
      .expect(200)
      .expect((response: ResponseWithBody) => {
        expect(bodyAs<MonthlyCashflowResponse>(response)).toHaveLength(1);
      });

    expect(transactions.getMonthlyCashflow).toHaveBeenCalledWith(OWNER_ID, {
      from: '2026-01',
      to: '2026-03',
      accountIds: ['acc-1', 'acc-2'],
      includeArchivedAccounts: true,
    });
  });

  it('returns analytics and trims optional account/category filters', async () => {
    transactions.getCashflowAnalytics.mockResolvedValue({
      from: '2026-01',
      to: '2026-03',
      focusMonth: '2026-03',
      currencies: [],
    } satisfies CashflowAnalyticsResponse);

    await request(httpServer())
      .get(
        '/cashflow/analytics?from=2026-01&to=2026-03&accountId=%20acc-1%20&categoryId=%20cat-1%20',
      )
      .expect(200)
      .expect((response: ResponseWithBody) => {
        expect(bodyAs<CashflowAnalyticsResponse>(response).focusMonth).toBe(
          '2026-03',
        );
      });

    expect(transactions.getCashflowAnalytics).toHaveBeenCalledWith(OWNER_ID, {
      from: '2026-01',
      to: '2026-03',
      accountId: 'acc-1',
      categoryId: 'cat-1',
      includeArchivedAccounts: undefined,
    });
  });

  it('returns the summary route and validates date filters', async () => {
    transactions.getCashflowSummary.mockResolvedValue([
      {
        currency: 'EUR',
        incomeTotal: 0,
        expenseTotal: 0,
        adjustmentInTotal: 0,
        adjustmentOutTotal: 0,
        netCashflow: 0,
        byCategory: [],
        byAccount: [],
      },
    ] satisfies CashflowSummaryResponse);

    await request(httpServer())
      .get('/cashflow/summary?from=2026-04-01&to=2026-04-30')
      .expect(200);

    expect(transactions.getCashflowSummary).toHaveBeenCalledWith(OWNER_ID, {
      from: '2026-04-01',
      to: '2026-04-30',
    });

    await request(httpServer())
      .get('/cashflow/analytics?from=2026-01-01&to=2026-03')
      .expect(400);
    await request(httpServer())
      .get('/cashflow/monthly?from=2026-01&to=2026-13')
      .expect(400);
    await request(httpServer())
      .get('/cashflow/summary?from=2026-04')
      .expect(400);
  });
});
