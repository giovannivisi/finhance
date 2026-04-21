import { BadRequestException, ConflictException } from '@nestjs/common';
import { AccountsService } from '@accounts/accounts.service';
import { Prisma } from '@prisma/client';
import {
  AccountType,
  AssetKind,
  AssetType,
  TransactionDirection,
  TransactionKind,
} from '@prisma/client';

const OWNER_ID = 'local-dev';
const ZERO = new Prisma.Decimal(0);

function firstCallArg<T>(mockFn: jest.Mock): T {
  const calls = mockFn.mock.calls as unknown[][];
  return calls[0]?.[0] as T;
}

function nthCallArg<T>(
  mockFn: jest.Mock,
  callIndex: number,
  argIndex: number,
): T {
  const calls = mockFn.mock.calls as unknown[][];
  return calls[callIndex]?.[argIndex] as T;
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

describe('AccountsService', () => {
  let service: AccountsService;
  let prisma: {
    account: {
      findMany: jest.Mock;
      findFirst: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
    asset: {
      findMany: jest.Mock;
      findFirst: jest.Mock;
    };
    transaction: {
      findMany: jest.Mock;
      findFirst: jest.Mock;
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

  beforeEach(() => {
    prisma = {
      account: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      asset: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
      },
      transaction: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
      },
      $transaction: jest.fn(),
    };

    prisma.$transaction.mockImplementation(
      async (
        callback: (tx: {
          account: typeof prisma.account;
          asset: typeof prisma.asset;
          transaction: typeof prisma.transaction;
        }) => Promise<unknown>,
      ) =>
        callback({
          account: prisma.account,
          asset: prisma.asset,
          transaction: prisma.transaction,
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

    service = new AccountsService(
      prisma as never,
      prices as never,
      transactionsService as never,
    );
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
        openingBalance: new Prisma.Decimal(0),
        openingBalanceDate: null,
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

  it('rejects non-zero opening balances without an opening balance date', async () => {
    await expect(
      service.create(OWNER_ID, {
        name: 'Checking',
        type: AccountType.BANK,
        openingBalance: 10,
      }),
    ).rejects.toThrow('openingBalanceDate is required');
  });

  it('reports a clean reconciliation when tracked and expected balances match', async () => {
    const account = createAccount();
    prisma.account.findMany.mockResolvedValue([account]);
    prisma.asset.findMany.mockResolvedValue([createAsset()]);
    prisma.transaction.findMany.mockResolvedValue([createTransaction()]);

    const [entry] = await service.findReconciliation(OWNER_ID);

    expect(entry).toMatchObject({
      status: 'CLEAN',
      assetCount: 1,
      transactionCount: 1,
      canCreateAdjustment: false,
      issueCodes: [],
    });
    expect(entry.trackedBalance?.eq(new Prisma.Decimal(100))).toBe(true);
    expect(entry.expectedBalance?.eq(new Prisma.Decimal(100))).toBe(true);
    expect(entry.delta?.eq(ZERO)).toBe(true);
  });

  it('uses opening balances as the reconciliation baseline and ignores older transactions', async () => {
    const account = createAccount({
      openingBalance: new Prisma.Decimal(40),
      openingBalanceDate: new Date('2026-04-10T00:00:00.000Z'),
    });
    prisma.account.findMany.mockResolvedValue([account]);
    prisma.asset.findMany.mockResolvedValue([
      createAsset({
        balance: new Prisma.Decimal(100),
      }),
    ]);
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

    const [entry] = await service.findReconciliation(OWNER_ID);

    expect(entry.status).toBe('CLEAN');
    expect(entry.expectedBalance?.eq(new Prisma.Decimal(100))).toBe(true);
    expect(entry.transactionCount).toBe(1);
  });

  it('supports zero opening balances as a pure reconciliation cutoff date', async () => {
    const account = createAccount({
      openingBalance: new Prisma.Decimal(0),
      openingBalanceDate: new Date('2026-04-10T00:00:00.000Z'),
    });
    prisma.account.findMany.mockResolvedValue([account]);
    prisma.asset.findMany.mockResolvedValue([createAsset()]);
    prisma.transaction.findMany.mockResolvedValue([
      createTransaction({
        id: 'before-cutoff',
        postedAt: new Date('2026-04-09T10:00:00.000Z'),
        amount: new Prisma.Decimal(25),
      }),
      createTransaction({
        id: 'after-cutoff',
        postedAt: new Date('2026-04-10T10:00:00.000Z'),
        amount: new Prisma.Decimal(100),
      }),
    ]);

    const [entry] = await service.findReconciliation(OWNER_ID);

    expect(entry.status).toBe('CLEAN');
    expect(entry.expectedBalance?.eq(new Prisma.Decimal(100))).toBe(true);
    expect(entry.transactionCount).toBe(1);
  });

  it('marks liabilities as negative tracked balances and exposes mismatches', async () => {
    const account = createAccount();
    prisma.account.findMany.mockResolvedValue([account]);
    prisma.asset.findMany.mockResolvedValue([
      createAsset({
        type: AssetType.LIABILITY,
        kind: AssetKind.OTHER,
        balance: new Prisma.Decimal(25),
      }),
    ]);
    prisma.transaction.findMany.mockResolvedValue([]);

    const [entry] = await service.findReconciliation(OWNER_ID);

    expect(entry.status).toBe('MISMATCH');
    expect(entry.trackedBalance?.eq(new Prisma.Decimal(-25))).toBe(true);
    expect(entry.expectedBalance?.eq(ZERO)).toBe(true);
    expect(entry.delta?.eq(new Prisma.Decimal(-25))).toBe(true);
    expect(entry.canCreateAdjustment).toBe(true);
  });

  it('converts cross-currency assets with FX rates in the account currency', async () => {
    const account = createAccount({ currency: 'EUR' });
    prisma.account.findMany.mockResolvedValue([account]);
    prisma.asset.findMany.mockResolvedValue([
      createAsset({
        currency: 'USD',
        balance: new Prisma.Decimal(100),
      }),
    ]);
    prisma.transaction.findMany.mockResolvedValue([
      createTransaction({
        amount: new Prisma.Decimal(90),
      }),
    ]);
    prices.getFxRate.mockResolvedValue(new Prisma.Decimal('0.9'));

    const [entry] = await service.findReconciliation(OWNER_ID);

    expect(prices.getFxRate).toHaveBeenCalledWith('USD', 'EUR');
    expect(entry.status).toBe('CLEAN');
    expect(entry.trackedBalance?.eq(new Prisma.Decimal(90))).toBe(true);
    expect(entry.expectedBalance?.eq(new Prisma.Decimal(90))).toBe(true);
  });

  it('marks reconciliation unsupported when FX is unavailable', async () => {
    const account = createAccount({ currency: 'EUR' });
    prisma.account.findMany.mockResolvedValue([account]);
    prisma.asset.findMany.mockResolvedValue([
      createAsset({
        currency: 'USD',
      }),
    ]);
    prisma.transaction.findMany.mockResolvedValue([createTransaction()]);
    prices.getFxRate.mockResolvedValue(null);

    const [entry] = await service.findReconciliation(OWNER_ID);

    expect(entry.status).toBe('UNSUPPORTED');
    expect(entry.trackedBalance).toBeNull();
    expect(entry.expectedBalance).toBeNull();
    expect(entry.delta).toBeNull();
    expect(entry.issueCodes).toContain('FX_UNAVAILABLE');
    expect(entry.canCreateAdjustment).toBe(false);
  });

  it('flags incomplete transfer groups while still computing expected balances', async () => {
    const account = createAccount();
    prisma.account.findMany.mockResolvedValue([account]);
    prisma.asset.findMany.mockResolvedValue([createAsset()]);
    prisma.transaction.findMany.mockResolvedValue([
      createTransaction({
        id: 'transfer-out',
        kind: TransactionKind.TRANSFER,
        direction: TransactionDirection.OUTFLOW,
        transferGroupId: 'transfer-1',
      }),
      createTransaction({
        id: 'income',
        kind: TransactionKind.INCOME,
        direction: TransactionDirection.INFLOW,
        amount: new Prisma.Decimal(50),
      }),
    ]);

    const [entry] = await service.findReconciliation(OWNER_ID);

    expect(entry.status).toBe('MISMATCH');
    expect(entry.issueCodes).toContain('TRANSFER_GROUP_INCOMPLETE');
    expect(entry.expectedBalance?.eq(new Prisma.Decimal(-50))).toBe(true);
  });

  it('does not flag complete transfers when the counterpart account is excluded from the result set', async () => {
    const activeAccount = createAccount({ id: 'active-account' });
    const archivedAccount = createAccount({
      id: 'archived-account',
      archivedAt: new Date('2026-04-20T08:00:00.000Z'),
    });

    prisma.account.findMany.mockResolvedValue([activeAccount]);
    prisma.asset.findMany.mockResolvedValue([
      createAsset({
        accountId: activeAccount.id,
        type: AssetType.LIABILITY,
        kind: AssetKind.OTHER,
        balance: new Prisma.Decimal(25),
      }),
    ]);
    prisma.transaction.findMany.mockResolvedValue([
      createTransaction({
        id: 'transfer-out',
        accountId: activeAccount.id,
        kind: TransactionKind.TRANSFER,
        direction: TransactionDirection.OUTFLOW,
        amount: new Prisma.Decimal(25),
        transferGroupId: 'transfer-1',
      }),
      createTransaction({
        id: 'transfer-in',
        accountId: archivedAccount.id,
        kind: TransactionKind.TRANSFER,
        direction: TransactionDirection.INFLOW,
        amount: new Prisma.Decimal(25),
        transferGroupId: 'transfer-1',
      }),
    ]);

    const [entry] = await service.findReconciliation(OWNER_ID);

    expect(entry.status).toBe('CLEAN');
    expect(entry.issueCodes).toEqual([]);
    expect(entry.canCreateAdjustment).toBe(false);
  });

  it('does not flag complete transfers when another account baseline filters out the counterpart row', async () => {
    const earlierAccount = createAccount({
      id: 'earlier-account',
      openingBalanceDate: new Date('2026-04-10T00:00:00.000Z'),
    });
    const laterAccount = createAccount({
      id: 'later-account',
      openingBalanceDate: new Date('2026-04-12T00:00:00.000Z'),
    });

    prisma.account.findMany.mockResolvedValue([earlierAccount, laterAccount]);
    prisma.asset.findMany.mockResolvedValue([
      createAsset({
        accountId: earlierAccount.id,
        type: AssetType.LIABILITY,
        kind: AssetKind.OTHER,
        balance: new Prisma.Decimal(25),
      }),
    ]);
    prisma.transaction.findMany.mockResolvedValue([
      createTransaction({
        id: 'transfer-out',
        accountId: earlierAccount.id,
        postedAt: new Date('2026-04-11T10:00:00.000Z'),
        kind: TransactionKind.TRANSFER,
        direction: TransactionDirection.OUTFLOW,
        amount: new Prisma.Decimal(25),
        transferGroupId: 'transfer-1',
      }),
      createTransaction({
        id: 'transfer-in',
        accountId: laterAccount.id,
        postedAt: new Date('2026-04-11T10:00:00.000Z'),
        kind: TransactionKind.TRANSFER,
        direction: TransactionDirection.INFLOW,
        amount: new Prisma.Decimal(25),
        transferGroupId: 'transfer-1',
      }),
    ]);

    const [earlierEntry, laterEntry] =
      await service.findReconciliation(OWNER_ID);

    expect(earlierEntry.status).toBe('CLEAN');
    expect(earlierEntry.issueCodes).toEqual([]);
    expect(laterEntry.transactionCount).toBe(0);
    expect(laterEntry.issueCodes).toEqual([]);
  });

  it('creates an inflow reconciliation adjustment for a positive delta', async () => {
    const account = createAccount();
    const createdTransaction = {
      entryType: 'STANDARD' as const,
      row: {
        ...createTransaction(),
        kind: TransactionKind.ADJUSTMENT,
      },
    };

    prisma.account.findMany.mockResolvedValue([account]);
    prisma.asset.findMany.mockResolvedValue([
      createAsset({
        balance: new Prisma.Decimal(150),
      }),
    ]);
    prisma.transaction.findMany.mockResolvedValue([
      createTransaction({
        amount: new Prisma.Decimal(100),
      }),
    ]);
    transactionsService.createReconciliationAdjustment.mockResolvedValue(
      createdTransaction,
    );

    const result = await service.createReconciliationAdjustment(
      OWNER_ID,
      account.id,
    );

    expect(result).toBe(createdTransaction);
    expect(
      transactionsService.createReconciliationAdjustment,
    ).toHaveBeenCalled();
    expect(
      nthCallArg<string>(
        transactionsService.createReconciliationAdjustment,
        0,
        0,
      ),
    ).toBe(OWNER_ID);
    const adjustmentInput = nthCallArg<{
      accountId: string;
      amount: Prisma.Decimal;
      direction: TransactionDirection;
      notes: string;
    }>(transactionsService.createReconciliationAdjustment, 0, 1);
    const adjustmentClient = nthCallArg<Prisma.TransactionClient>(
      transactionsService.createReconciliationAdjustment,
      0,
      2,
    );
    expect(adjustmentInput.accountId).toBe(account.id);
    expect(adjustmentInput.amount.eq(new Prisma.Decimal(50))).toBe(true);
    expect(adjustmentInput.direction).toBe(TransactionDirection.INFLOW);
    expect(adjustmentInput.notes).toContain('tracked=150');
    expect(adjustmentInput.notes).toContain('expected=100');
    expect(adjustmentInput.notes).toContain('delta=50');
    expect(adjustmentClient).toMatchObject({
      account: prisma.account,
      asset: prisma.asset,
      transaction: prisma.transaction,
    });
    expect(prisma.$transaction).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      }),
    );
  });

  it('creates an outflow reconciliation adjustment for a negative delta', async () => {
    const account = createAccount();
    const createdTransaction = {
      entryType: 'STANDARD' as const,
      row: {
        ...createTransaction(),
        kind: TransactionKind.ADJUSTMENT,
      },
    };

    prisma.account.findMany.mockResolvedValue([account]);
    prisma.asset.findMany.mockResolvedValue([
      createAsset({
        balance: new Prisma.Decimal(80),
      }),
    ]);
    prisma.transaction.findMany.mockResolvedValue([
      createTransaction({
        amount: new Prisma.Decimal(100),
      }),
    ]);
    transactionsService.createReconciliationAdjustment.mockResolvedValue(
      createdTransaction,
    );

    await service.createReconciliationAdjustment(OWNER_ID, account.id);

    const adjustmentInput = nthCallArg<{
      amount: Prisma.Decimal;
      direction: TransactionDirection;
    }>(transactionsService.createReconciliationAdjustment, 0, 1);
    expect(adjustmentInput.amount.eq(new Prisma.Decimal(20))).toBe(true);
    expect(adjustmentInput.direction).toBe(TransactionDirection.OUTFLOW);
  });

  it('does not allow reconciliation adjustments when transfer integrity is broken', async () => {
    const account = createAccount();
    prisma.account.findMany.mockResolvedValue([account]);
    prisma.asset.findMany.mockResolvedValue([
      createAsset({
        balance: new Prisma.Decimal(80),
      }),
    ]);
    prisma.transaction.findMany.mockResolvedValue([
      createTransaction({
        id: 'transfer-out',
        kind: TransactionKind.TRANSFER,
        direction: TransactionDirection.OUTFLOW,
        amount: new Prisma.Decimal(25),
        transferGroupId: 'transfer-1',
      }),
    ]);

    const [entry] = await service.findReconciliation(OWNER_ID);

    expect(entry.issueCodes).toContain('TRANSFER_GROUP_INCOMPLETE');
    expect(entry.canCreateAdjustment).toBe(false);
    await expect(
      service.createReconciliationAdjustment(OWNER_ID, account.id),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(
      transactionsService.createReconciliationAdjustment,
    ).not.toHaveBeenCalled();
  });

  it('rejects currency changes while an opening-balance baseline exists', async () => {
    const existing = createAccount({
      openingBalance: new Prisma.Decimal(100),
      openingBalanceDate: new Date('2026-04-10T00:00:00.000Z'),
    });

    prisma.account.findFirst.mockResolvedValue(existing);

    await expect(
      service.update(OWNER_ID, existing.id, {
        name: existing.name,
        type: existing.type,
        currency: 'USD',
        institution: existing.institution,
        notes: existing.notes,
        order: existing.order,
        openingBalance: 100,
        openingBalanceDate: '2026-04-10',
      }),
    ).rejects.toThrow('Clear the opening balance baseline');
  });

  it('rejects opening-balance baseline changes once the account has history', async () => {
    const existing = createAccount();

    prisma.account.findFirst.mockResolvedValue(existing);
    prisma.asset.findFirst.mockResolvedValue(createAsset());
    prisma.transaction.findFirst.mockResolvedValue(null);

    await expect(
      service.update(OWNER_ID, existing.id, {
        name: existing.name,
        type: existing.type,
        currency: existing.currency,
        institution: existing.institution,
        notes: existing.notes,
        order: existing.order,
        openingBalance: 25,
        openingBalanceDate: '2026-04-10',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects opening-balance baseline changes once the account has transactions', async () => {
    const existing = createAccount();

    prisma.account.findFirst.mockResolvedValue(existing);
    prisma.asset.findFirst.mockResolvedValue(null);
    prisma.transaction.findFirst.mockResolvedValue(createTransaction());

    await expect(
      service.update(OWNER_ID, existing.id, {
        name: existing.name,
        type: existing.type,
        currency: existing.currency,
        institution: existing.institution,
        notes: existing.notes,
        order: existing.order,
        openingBalance: 25,
        openingBalanceDate: '2026-04-10',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
