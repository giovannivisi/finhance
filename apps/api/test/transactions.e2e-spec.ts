import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AccountsService } from '@accounts/accounts.service';
import { RequestOwnerResolver } from '@/security/request-owner.resolver';
import { CategoriesService } from '@transactions/categories.service';
import { CashflowController } from '@transactions/cashflow.controller';
import { TransactionsController } from '@transactions/transactions.controller';
import { TransactionsService } from '@transactions/transactions.service';
import type {
  CashflowSummaryResponse,
  TransactionResponse,
} from '@finhance/shared';
import {
  CategoryType,
  Prisma,
  TransactionDirection,
  TransactionKind,
} from '@prisma/client';
import { PrismaService } from '@prisma/prisma.service';

const OWNER_ID = 'local-dev';
type ResponseWithBody = { body: unknown };
type HttpServer = Parameters<typeof request>[0];

function bodyAs<T>(response: ResponseWithBody): T {
  return response.body as T;
}

function createAccount(overrides: Partial<Record<string, unknown>> = {}) {
  const now = new Date('2026-04-17T10:00:00.000Z');

  return {
    id: 'account-1',
    userId: OWNER_ID,
    name: 'Checking',
    type: 'BANK',
    currency: 'EUR',
    institution: null,
    notes: null,
    order: 0,
    openingBalance: new Prisma.Decimal('0'),
    openingBalanceDate: null,
    archivedAt: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function createCategory(overrides: Partial<Record<string, unknown>> = {}) {
  const now = new Date('2026-04-17T10:00:00.000Z');

  return {
    id: 'category-1',
    userId: OWNER_ID,
    name: 'Salary',
    type: CategoryType.INCOME,
    order: 0,
    archivedAt: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function createTransactionRow(
  overrides: Partial<Record<string, unknown>> = {},
) {
  const now = new Date('2026-04-17T10:00:00.000Z');

  return {
    id: 'transaction-1',
    userId: OWNER_ID,
    postedAt: new Date('2026-04-17T09:00:00.000Z'),
    accountId: 'account-1',
    categoryId: 'category-1',
    amount: new Prisma.Decimal('100'),
    currency: 'EUR',
    direction: TransactionDirection.INFLOW,
    kind: TransactionKind.INCOME,
    description: 'Salary',
    notes: null,
    counterparty: 'Employer',
    transferGroupId: null,
    createdAt: now,
    updatedAt: now,
    account: createAccount(),
    category: createCategory(),
    ...overrides,
  };
}

function expectTransactionResponseDto(
  body: Record<string, unknown>,
  expected: Record<string, unknown>,
) {
  expect(body).toMatchObject(expected);
}

describe('Transaction routes (e2e)', () => {
  let app: INestApplication;
  let prisma: {
    transaction: {
      findMany: jest.Mock;
      findFirst: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
      deleteMany: jest.Mock;
    };
    $transaction: jest.Mock;
  };
  let accounts: {
    getAssignableAccount: jest.Mock;
  };
  let categories: {
    getAssignableCategory: jest.Mock;
  };

  function httpServer(): HttpServer {
    return app.getHttpServer() as HttpServer;
  }

  beforeEach(async () => {
    prisma = {
      transaction: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
        deleteMany: jest.fn(),
      },
      $transaction: jest.fn(),
    };

    prisma.$transaction.mockImplementation(
      async (
        callback: (tx: {
          transaction: typeof prisma.transaction;
        }) => Promise<unknown>,
      ) =>
        callback({
          transaction: prisma.transaction,
        }),
    );

    accounts = {
      getAssignableAccount: jest.fn().mockResolvedValue(createAccount()),
    };

    categories = {
      getAssignableCategory: jest.fn().mockResolvedValue(createCategory()),
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [TransactionsController, CashflowController],
      providers: [
        TransactionsService,
        { provide: PrismaService, useValue: prisma },
        { provide: AccountsService, useValue: accounts },
        { provide: CategoriesService, useValue: categories },
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

  it('creates non-transfer transactions through POST /transactions', async () => {
    prisma.transaction.create.mockResolvedValue(createTransactionRow());

    await request(httpServer())
      .post('/transactions')
      .send({
        postedAt: '2026-04-17T09:00:00.000Z',
        kind: 'INCOME',
        amount: 100,
        description: 'Salary',
        accountId: 'account-1',
        direction: 'INFLOW',
        categoryId: 'category-1',
      })
      .expect(201)
      .expect((response: ResponseWithBody) => {
        expectTransactionResponseDto(
          bodyAs<Record<string, unknown>>(response),
          {
            id: 'transaction-1',
            kind: 'INCOME',
            accountId: 'account-1',
            categoryId: 'category-1',
            sourceAccountId: null,
            destinationAccountId: null,
          },
        );
      });
  });

  it('creates logical transfer transactions through POST /transactions', async () => {
    accounts.getAssignableAccount
      .mockResolvedValueOnce(createAccount({ id: 'source', currency: 'EUR' }))
      .mockResolvedValueOnce(
        createAccount({ id: 'destination', currency: 'EUR' }),
      );
    prisma.transaction.findMany.mockResolvedValue([
      createTransactionRow({
        id: 'row-out',
        accountId: 'source',
        categoryId: null,
        kind: TransactionKind.TRANSFER,
        direction: TransactionDirection.OUTFLOW,
        transferGroupId: 'transfer_group',
        counterparty: null,
      }),
      createTransactionRow({
        id: 'row-in',
        accountId: 'destination',
        categoryId: null,
        kind: TransactionKind.TRANSFER,
        direction: TransactionDirection.INFLOW,
        transferGroupId: 'transfer_group',
        counterparty: null,
      }),
    ]);

    await request(httpServer())
      .post('/transactions')
      .send({
        postedAt: '2026-04-17T09:00:00.000Z',
        kind: 'TRANSFER',
        amount: 25,
        description: 'Transfer',
        sourceAccountId: 'source',
        destinationAccountId: 'destination',
      })
      .expect(201)
      .expect((response: ResponseWithBody) => {
        expectTransactionResponseDto(
          bodyAs<Record<string, unknown>>(response),
          {
            id: expect.stringMatching(/^transfer_/),
            kind: 'TRANSFER',
            sourceAccountId: 'source',
            destinationAccountId: 'destination',
            accountId: null,
            direction: null,
          },
        );
      });

    expect(prisma.transaction.create).toHaveBeenCalledTimes(2);
  });

  it('rejects extra body fields on POST /transactions', async () => {
    await request(httpServer())
      .post('/transactions')
      .send({
        postedAt: '2026-04-17T09:00:00.000Z',
        kind: 'INCOME',
        amount: 100,
        description: 'Salary',
        accountId: 'account-1',
        direction: 'INFLOW',
        currency: 'EUR',
      })
      .expect(400);
  });

  it('rejects non-transfer transactions before the account opening-balance date', async () => {
    accounts.getAssignableAccount.mockResolvedValue(
      createAccount({
        openingBalanceDate: new Date('2026-04-10T00:00:00.000Z'),
      }),
    );

    await request(httpServer())
      .post('/transactions')
      .send({
        postedAt: '2026-04-09T09:00:00.000Z',
        kind: 'INCOME',
        amount: 100,
        description: 'Salary',
        accountId: 'account-1',
        direction: 'INFLOW',
      })
      .expect(400);
  });

  it('rejects transfers before either account opening-balance date', async () => {
    accounts.getAssignableAccount
      .mockResolvedValueOnce(
        createAccount({
          id: 'source',
          openingBalanceDate: new Date('2026-04-10T00:00:00.000Z'),
        }),
      )
      .mockResolvedValueOnce(
        createAccount({
          id: 'destination',
          openingBalanceDate: new Date('2026-04-11T00:00:00.000Z'),
        }),
      );

    await request(httpServer())
      .post('/transactions')
      .send({
        postedAt: '2026-04-10T12:00:00.000Z',
        kind: 'TRANSFER',
        amount: 25,
        description: 'Transfer',
        sourceAccountId: 'source',
        destinationAccountId: 'destination',
      })
      .expect(400);
  });

  it('rejects updates for generated recurring transactions through PUT /transactions/:id', async () => {
    prisma.transaction.findFirst.mockResolvedValue(
      createTransactionRow({
        recurringRuleId: 'rule-1',
        recurringOccurrenceMonth: new Date('2026-04-01T00:00:00.000Z'),
      }),
    );

    await request(httpServer())
      .put('/transactions/transaction-1')
      .send({
        postedAt: '2026-04-17T09:00:00.000Z',
        kind: 'INCOME',
        amount: 100,
        description: 'Salary',
        accountId: 'account-1',
        direction: 'INFLOW',
      })
      .expect(409)
      .expect((response: ResponseWithBody) => {
        expect(bodyAs<Record<string, unknown>>(response).message).toContain(
          'Generated recurring transactions',
        );
      });
  });

  it('returns logical DTOs from GET /transactions', async () => {
    prisma.transaction.findMany.mockResolvedValue([createTransactionRow()]);

    await request(httpServer())
      .get('/transactions')
      .expect(200)
      .expect((response: ResponseWithBody) => {
        const body = bodyAs<TransactionResponse[]>(response);
        expect(body).toHaveLength(1);
        expect(body[0]).toMatchObject({
          id: 'transaction-1',
          kind: 'INCOME',
          accountId: 'account-1',
        });
      });
  });

  it('applies transaction result limits from GET /transactions', async () => {
    prisma.transaction.findMany.mockResolvedValue([
      createTransactionRow({ id: 'transaction-1' }),
      createTransactionRow({ id: 'transaction-2' }),
    ]);

    await request(httpServer())
      .get('/transactions?limit=1')
      .expect(200)
      .expect((response: ResponseWithBody) => {
        const body = bodyAs<TransactionResponse[]>(response);
        expect(body).toHaveLength(1);
        expect(body[0]).toMatchObject({ id: 'transaction-1' });
      });
  });

  it('rejects overly long transaction descriptions on POST /transactions', async () => {
    await request(httpServer())
      .post('/transactions')
      .send({
        postedAt: '2026-04-17T09:00:00.000Z',
        kind: 'INCOME',
        amount: 100,
        description: 'D'.repeat(241),
        accountId: 'account-1',
        direction: 'INFLOW',
      })
      .expect(400);
  });

  it('deletes both rows for logical transfers', async () => {
    prisma.transaction.findFirst.mockResolvedValue(
      createTransactionRow({
        id: 'row-out',
        accountId: 'source',
        categoryId: null,
        kind: TransactionKind.TRANSFER,
        direction: TransactionDirection.OUTFLOW,
        transferGroupId: 'transfer_group',
        counterparty: null,
      }),
    );
    prisma.transaction.findMany.mockResolvedValue([
      createTransactionRow({
        id: 'row-out',
        accountId: 'source',
        categoryId: null,
        kind: TransactionKind.TRANSFER,
        direction: TransactionDirection.OUTFLOW,
        transferGroupId: 'transfer_group',
        counterparty: null,
      }),
      createTransactionRow({
        id: 'row-in',
        accountId: 'destination',
        categoryId: null,
        kind: TransactionKind.TRANSFER,
        direction: TransactionDirection.INFLOW,
        transferGroupId: 'transfer_group',
        counterparty: null,
      }),
    ]);

    await request(httpServer()).delete('/transactions/row-out').expect(204);

    expect(prisma.transaction.deleteMany).toHaveBeenCalledWith({
      where: {
        userId: OWNER_ID,
        transferGroupId: 'transfer_group',
      },
    });
  });

  it('returns owner-scoped cashflow summary DTOs', async () => {
    prisma.transaction.findMany.mockResolvedValue([createTransactionRow()]);

    await request(httpServer())
      .get('/cashflow/summary')
      .expect(200)
      .expect((response: ResponseWithBody) => {
        const body = bodyAs<CashflowSummaryResponse>(response);
        expect(body).toEqual([
          expect.objectContaining({
            currency: 'EUR',
            incomeTotal: 100,
            expenseTotal: 0,
            netCashflow: 100,
          }),
        ]);
      });
  });

  it('rejects cashflow ranges longer than the configured cap', async () => {
    await request(httpServer())
      .get('/cashflow/summary?from=2000-01-01&to=2026-04-17')
      .expect(400);
  });
});
