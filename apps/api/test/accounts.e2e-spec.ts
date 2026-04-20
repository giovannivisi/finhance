import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AccountsController } from '@accounts/accounts.controller';
import { AccountsService } from '@accounts/accounts.service';
import { Prisma } from '@prisma/client';
import type {
  AccountReconciliationResponse,
  AccountResponse,
  TransactionResponse,
} from '@finhance/shared';
import { PricesService } from '@prices/prices.service';
import { PrismaService } from '@prisma/prisma.service';
import { RequestOwnerResolver } from '@/security/request-owner.resolver';
import { TransactionsService } from '@transactions/transactions.service';
import {
  Account,
  AccountType,
  AssetKind,
  AssetType,
  TransactionDirection,
  TransactionKind,
} from '@prisma/client';

const OWNER_ID = 'local-dev';
type ResponseWithBody = { body: unknown };
type HttpServer = Parameters<typeof request>[0];

function bodyAs<T>(response: ResponseWithBody): T {
  return response.body as T;
}

function firstCallArg<T>(mockFn: jest.Mock): T {
  const calls = mockFn.mock.calls as unknown[][];
  return calls[0]?.[0] as T;
}

function createAccount(overrides: Partial<Account> = {}): Account {
  const now = new Date();

  return {
    id: 'account-1',
    userId: OWNER_ID,
    name: 'Checking',
    type: AccountType.BANK,
    currency: 'EUR',
    institution: 'Bank',
    notes: null,
    order: 0,
    openingBalance: new Prisma.Decimal(0),
    openingBalanceDate: null,
    archivedAt: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function createAsset(overrides: Partial<Record<string, unknown>> = {}) {
  const now = new Date();

  return {
    id: 'asset-1',
    userId: OWNER_ID,
    name: 'Cash',
    type: AssetType.ASSET,
    kind: AssetKind.CASH,
    liabilityKind: null,
    currency: 'EUR',
    balance: new Prisma.Decimal(100),
    ticker: null,
    exchange: null,
    quantity: null,
    unitPrice: null,
    accountId: 'account-1',
    lastPrice: null,
    lastPriceAt: null,
    lastFxRate: null,
    lastFxRateAt: null,
    notes: null,
    order: 0,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function createTransaction(overrides: Partial<Record<string, unknown>> = {}) {
  const now = new Date();

  return {
    id: 'transaction-1',
    userId: OWNER_ID,
    postedAt: now,
    amount: new Prisma.Decimal(100),
    currency: 'EUR',
    kind: TransactionKind.INCOME,
    accountId: 'account-1',
    direction: TransactionDirection.INFLOW,
    categoryId: null,
    description: 'Salary',
    notes: null,
    counterparty: null,
    transferGroupId: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function expectAccountResponseDto(
  body: Record<string, unknown>,
  account: ReturnType<typeof createAccount>,
) {
  expect(body).toEqual({
    id: account.id,
    name: account.name,
    type: account.type,
    currency: account.currency,
    institution: account.institution,
    notes: account.notes,
    order: account.order,
    openingBalance: account.openingBalance.toNumber(),
    openingBalanceDate:
      account.openingBalanceDate?.toISOString().slice(0, 10) ?? null,
    archivedAt: account.archivedAt?.toISOString() ?? null,
    createdAt: account.createdAt.toISOString(),
    updatedAt: account.updatedAt.toISOString(),
  });
  expect(body).not.toHaveProperty('userId');
}

describe('Account routes (e2e)', () => {
  let app: INestApplication;
  let prisma: {
    account: {
      findMany: jest.Mock;
      findFirst: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
    asset: {
      findMany: jest.Mock;
    };
    transaction: {
      findMany: jest.Mock;
    };
    $transaction: jest.Mock;
  };
  let prices: {
    normalizeCurrency: jest.Mock;
    getFxRate: jest.Mock;
  };
  let transactionsService: {
    createReconciliationAdjustment: jest.Mock;
  };

  function httpServer(): HttpServer {
    return app.getHttpServer() as HttpServer;
  }

  beforeEach(async () => {
    prisma = {
      account: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      asset: {
        findMany: jest.fn(),
      },
      transaction: {
        findMany: jest.fn(),
      },
      $transaction: jest.fn(),
    };

    prisma.$transaction.mockImplementation(
      async (
        callback: (tx: { account: typeof prisma.account }) => Promise<unknown>,
      ) =>
        callback({
          account: prisma.account,
        }),
    );

    prices = {
      normalizeCurrency: jest.fn((currency?: string | null) =>
        (currency ?? 'EUR').trim().toUpperCase(),
      ),
      getFxRate: jest.fn(),
    };

    transactionsService = {
      createReconciliationAdjustment: jest.fn(),
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [AccountsController],
      providers: [
        AccountsService,
        { provide: PrismaService, useValue: prisma },
        { provide: PricesService, useValue: prices },
        { provide: TransactionsService, useValue: transactionsService },
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

  it('creates accounts through POST /accounts', async () => {
    const created = createAccount({
      openingBalance: new Prisma.Decimal('250'),
      openingBalanceDate: new Date('2026-04-10T00:00:00.000Z'),
    });

    prisma.account.findMany.mockResolvedValue([]);
    prisma.account.create.mockResolvedValue(created);
    prisma.account.findFirst.mockResolvedValue(created);

    await request(httpServer())
      .post('/accounts')
      .send({
        name: 'Checking',
        type: 'BANK',
        currency: 'eur',
        institution: 'Bank',
        openingBalance: 250,
        openingBalanceDate: '2026-04-10',
      })
      .expect(201)
      .expect((response: ResponseWithBody) => {
        const body = bodyAs<Record<string, unknown>>(response);
        expectAccountResponseDto(body, created);
      });
  });

  it('returns DTO responses from GET /accounts', async () => {
    const account = createAccount();
    prisma.account.findMany.mockResolvedValue([account]);

    await request(httpServer())
      .get('/accounts')
      .expect(200)
      .expect((response: ResponseWithBody) => {
        const body = bodyAs<AccountResponse[]>(response);
        expect(body).toHaveLength(1);
        expectAccountResponseDto(
          body[0] as unknown as Record<string, unknown>,
          account,
        );
      });
  });

  it('archives accounts through DELETE /accounts/:id', async () => {
    const accountA = createAccount({ id: 'account-1', order: 0 });
    const accountB = createAccount({ id: 'account-2', order: 1 });

    prisma.account.findFirst.mockResolvedValue(accountA);
    prisma.account.findMany.mockResolvedValue([accountA, accountB]);
    prisma.account.update.mockResolvedValue(accountB);

    await request(httpServer()).delete('/accounts/account-1').expect(204);

    const archiveUpdate = firstCallArg<{
      where: { id: string };
      data: { archivedAt: Date };
    }>(prisma.account.update);

    expect(archiveUpdate).toMatchObject({
      where: { id: 'account-1' },
      data: {
        archivedAt: expect.any(Date) as Date,
      },
    });
    expect(prisma.account.update.mock.calls[1]).toEqual([
      { where: { id: 'account-2' }, data: { order: 0 } },
    ]);
  });

  it('returns account reconciliation rows from GET /accounts/reconciliation', async () => {
    const account = createAccount({
      openingBalance: new Prisma.Decimal(40),
      openingBalanceDate: new Date('2026-04-10T00:00:00.000Z'),
    });
    prisma.account.findMany.mockResolvedValue([account]);
    prisma.asset.findMany.mockResolvedValue([createAsset()]);
    prisma.transaction.findMany.mockResolvedValue([
      createTransaction({
        id: 'before-cutoff',
        postedAt: new Date('2026-04-09T10:00:00.000Z'),
        amount: new Prisma.Decimal(500),
      }),
      createTransaction({
        id: 'after-cutoff',
        postedAt: new Date('2026-04-10T10:00:00.000Z'),
        amount: new Prisma.Decimal(60),
      }),
    ]);

    await request(httpServer())
      .get('/accounts/reconciliation')
      .expect(200)
      .expect((response: ResponseWithBody) => {
        const body = bodyAs<AccountReconciliationResponse[]>(response);
        expect(body).toHaveLength(1);
        expect(body[0]).toEqual({
          status: 'CLEAN',
          accountId: account.id,
          accountName: account.name,
          accountType: account.type,
          currency: account.currency,
          trackedBalance: 100,
          expectedBalance: 100,
          delta: 0,
          assetCount: 1,
          transactionCount: 1,
          issueCodes: [],
          canCreateAdjustment: false,
        });
        expect(prisma.account.findMany).toHaveBeenCalledWith({
          where: { userId: OWNER_ID, archivedAt: null },
          orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
        });
      });
  });

  it('includes archived accounts in reconciliation when requested', async () => {
    const active = createAccount({ id: 'active', order: 0 });
    const archived = createAccount({
      id: 'archived',
      order: 1,
      archivedAt: new Date('2026-04-20T08:00:00.000Z'),
    });

    prisma.account.findMany.mockResolvedValue([active, archived]);
    prisma.asset.findMany.mockResolvedValue([]);
    prisma.transaction.findMany.mockResolvedValue([]);

    await request(httpServer())
      .get('/accounts/reconciliation?includeArchived=true')
      .expect(200)
      .expect((response: ResponseWithBody) => {
        const body = bodyAs<AccountReconciliationResponse[]>(response);
        expect(body.map((entry) => entry.accountId)).toEqual([
          active.id,
          archived.id,
        ]);
        expect(prisma.account.findMany).toHaveBeenCalledWith({
          where: { userId: OWNER_ID },
          orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
        });
      });
  });

  it('creates an adjustment through POST /accounts/:id/reconciliation/adjust', async () => {
    const account = createAccount();
    const createdAt = new Date('2026-04-20T12:00:00.000Z');

    prisma.account.findMany.mockResolvedValue([account]);
    prisma.asset.findMany.mockResolvedValue([
      createAsset({
        balance: new Prisma.Decimal(140),
      }),
    ]);
    prisma.transaction.findMany.mockResolvedValue([
      createTransaction({
        amount: new Prisma.Decimal(100),
      }),
    ]);
    transactionsService.createReconciliationAdjustment.mockResolvedValue({
      entryType: 'STANDARD',
      row: {
        ...createTransaction({
          id: 'adjustment-1',
          kind: TransactionKind.ADJUSTMENT,
          amount: new Prisma.Decimal(40),
          description: 'Account reconciliation adjustment',
          notes: 'Reconciliation snapshot',
          createdAt,
          updatedAt: createdAt,
          postedAt: createdAt,
        }),
        account: account,
        category: null,
      },
    });

    await request(httpServer())
      .post(`/accounts/${account.id}/reconciliation/adjust`)
      .expect(201)
      .expect((response: ResponseWithBody) => {
        const body = bodyAs<TransactionResponse>(response);
        expect(body).toEqual({
          id: 'adjustment-1',
          postedAt: createdAt.toISOString(),
          amount: 40,
          currency: 'EUR',
          kind: 'ADJUSTMENT',
          accountId: account.id,
          direction: 'INFLOW',
          categoryId: null,
          description: 'Account reconciliation adjustment',
          notes: 'Reconciliation snapshot',
          counterparty: null,
          sourceAccountId: null,
          destinationAccountId: null,
          createdAt: createdAt.toISOString(),
          updatedAt: createdAt.toISOString(),
        });
      });
  });

  it('rejects adjustment creation for clean reconciliation rows', async () => {
    const account = createAccount();
    prisma.account.findMany.mockResolvedValue([account]);
    prisma.asset.findMany.mockResolvedValue([createAsset()]);
    prisma.transaction.findMany.mockResolvedValue([createTransaction()]);

    await request(httpServer())
      .post(`/accounts/${account.id}/reconciliation/adjust`)
      .expect(409);
  });

  it('rejects accounts with a non-zero opening balance but no date', async () => {
    await request(httpServer())
      .post('/accounts')
      .send({
        name: 'Checking',
        type: 'BANK',
        openingBalance: 10,
      })
      .expect(400);
  });

  it('round-trips opening balance fields through PUT /accounts/:id', async () => {
    const existing = createAccount();
    const updated = createAccount({
      openingBalance: new Prisma.Decimal('75'),
      openingBalanceDate: new Date('2026-04-12T00:00:00.000Z'),
      notes: 'Baseline set',
    });

    prisma.account.findFirst
      .mockResolvedValueOnce(existing)
      .mockResolvedValueOnce(updated);
    prisma.account.update.mockResolvedValue(updated);
    prisma.account.findMany.mockResolvedValue([existing]);

    await request(httpServer())
      .put(`/accounts/${existing.id}`)
      .send({
        name: existing.name,
        type: existing.type,
        currency: existing.currency,
        institution: existing.institution,
        notes: 'Baseline set',
        order: existing.order,
        openingBalance: 75,
        openingBalanceDate: '2026-04-12',
      })
      .expect(200)
      .expect((response: ResponseWithBody) => {
        expectAccountResponseDto(
          bodyAs<Record<string, unknown>>(response),
          updated,
        );
      });
  });

  it('rejects changing account currency while an opening-balance baseline exists', async () => {
    const existing = createAccount({
      openingBalance: new Prisma.Decimal('100'),
      openingBalanceDate: new Date('2026-04-10T00:00:00.000Z'),
    });

    prisma.account.findFirst.mockResolvedValue(existing);

    await request(httpServer())
      .put(`/accounts/${existing.id}`)
      .send({
        name: existing.name,
        type: existing.type,
        currency: 'USD',
        institution: existing.institution,
        notes: existing.notes,
        order: existing.order,
        openingBalance: 100,
        openingBalanceDate: '2026-04-10',
      })
      .expect(400);
  });

  it('rejects client-controlled userId on POST /accounts', async () => {
    await request(httpServer())
      .post('/accounts')
      .send({
        userId: 'spoofed-user',
        name: 'Checking',
        type: 'BANK',
      })
      .expect(400);
  });

  it('rejects client-controlled archivedAt on PUT /accounts/:id', async () => {
    await request(httpServer())
      .put('/accounts/account-1')
      .send({
        name: 'Checking',
        type: 'BANK',
        archivedAt: '2026-04-17T10:00:00.000Z',
      })
      .expect(400);
  });

  it('rejects overly long account names on POST /accounts', async () => {
    await request(httpServer())
      .post('/accounts')
      .send({
        name: 'A'.repeat(121),
        type: 'BANK',
      })
      .expect(400);
  });
});
