import { BadRequestException } from '@nestjs/common';
import { AccountsService } from '@accounts/accounts.service';
import { AccountType } from '@prisma/client';

const OWNER_ID = 'local-dev';

function firstCallArg<T>(mockFn: jest.Mock): T {
  const calls = mockFn.mock.calls as unknown[][];
  return calls[0]?.[0] as T;
}

function createAccount(overrides: Partial<Record<string, unknown>> = {}) {
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

describe('AccountsService', () => {
  let service: AccountsService;
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

  beforeEach(() => {
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

    service = new AccountsService(prisma as never, prices as never);
  });

  it('creates accounts at the requested order and reindexes active accounts', async () => {
    const existingA = createAccount({ id: 'account-1', order: 0 });
    const existingB = createAccount({ id: 'account-2', order: 1 });
    const created = createAccount({
      id: 'account-3',
      order: 2,
      name: 'Broker',
    });
    const finalCreated = createAccount({
      id: 'account-3',
      order: 0,
      name: 'Broker',
    });

    prisma.account.findMany.mockResolvedValue([existingA, existingB]);
    prisma.account.create.mockResolvedValue(created);
    prisma.account.findFirst.mockResolvedValue(finalCreated);

    const result = await service.create(OWNER_ID, {
      name: 'Broker',
      type: AccountType.BROKER,
      currency: 'usd',
      order: 0,
    });

    expect(result.order).toBe(0);
    expect(prisma.account.create).toHaveBeenCalledWith({
      data: {
        userId: OWNER_ID,
        name: 'Broker',
        type: AccountType.BROKER,
        currency: 'USD',
        institution: null,
        notes: null,
        order: 2,
      },
    });
    expect(prisma.account.update.mock.calls).toEqual([
      [{ where: { id: 'account-3' }, data: { order: 0 } }],
      [{ where: { id: 'account-1' }, data: { order: 1 } }],
      [{ where: { id: 'account-2' }, data: { order: 2 } }],
    ]);
  });

  it('lists only active accounts by default and can include archived ones', async () => {
    prisma.account.findMany.mockResolvedValueOnce([createAccount()]);
    prisma.account.findMany.mockResolvedValueOnce([
      createAccount(),
      createAccount({
        id: 'account-2',
        archivedAt: new Date('2026-04-17T10:00:00.000Z'),
      }),
    ]);

    await service.findAll(OWNER_ID);
    await service.findAll(OWNER_ID, { includeArchived: true });

    expect(prisma.account.findMany).toHaveBeenNthCalledWith(1, {
      where: { userId: OWNER_ID, archivedAt: null },
      orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
    });
    expect(prisma.account.findMany).toHaveBeenNthCalledWith(2, {
      where: { userId: OWNER_ID },
      orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
    });
  });

  it('archives accounts and compacts the remaining active order', async () => {
    const accountA = createAccount({ id: 'account-1', order: 0 });
    const accountB = createAccount({ id: 'account-2', order: 1 });

    prisma.account.findFirst.mockResolvedValue(accountA);
    prisma.account.findMany.mockResolvedValue([accountA, accountB]);
    prisma.account.update.mockResolvedValue(accountB);

    await service.remove(OWNER_ID, 'account-1');

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

  it('rejects invalid or newly archived account assignments', async () => {
    prisma.account.findFirst.mockResolvedValueOnce(null);

    await expect(
      service.assertAccountAssignmentAllowed(OWNER_ID, 'missing-account'),
    ).rejects.toBeInstanceOf(BadRequestException);

    prisma.account.findFirst.mockResolvedValueOnce(
      createAccount({ archivedAt: new Date('2026-04-17T10:00:00.000Z') }),
    );

    await expect(
      service.assertAccountAssignmentAllowed(OWNER_ID, 'account-1'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
