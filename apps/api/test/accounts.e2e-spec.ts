import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AccountsController } from '@accounts/accounts.controller';
import { AccountsService } from '@accounts/accounts.service';
import type { AccountResponse } from '@finhance/shared';
import { PricesService } from '@prices/prices.service';
import { PrismaService } from '@prisma/prisma.service';
import { RequestOwnerResolver } from '@/security/request-owner.resolver';
import { Account, AccountType } from '@prisma/client';

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
    archivedAt: null,
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
    $transaction: jest.Mock;
  };
  let prices: {
    normalizeCurrency: jest.Mock;
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
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [AccountsController],
      providers: [
        AccountsService,
        { provide: PrismaService, useValue: prisma },
        { provide: PricesService, useValue: prices },
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
    const created = createAccount();

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
