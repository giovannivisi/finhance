import { AccountsService } from '@accounts/accounts.service';
import {
  CategoryType,
  Prisma,
  TransactionDirection,
  TransactionKind,
} from '@prisma/client';
import { CategoriesService } from '@transactions/categories.service';
import { TransactionsService } from '@transactions/transactions.service';

const OWNER_ID = 'local-dev';
type TransactionCreateCall = {
  data: {
    accountId?: string;
    currency?: string;
    categoryId?: string | null;
    description?: string;
    counterparty?: string | null;
  };
  include: {
    account: true;
    category: true;
  };
};

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

describe('TransactionsService', () => {
  let service: TransactionsService;
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

  beforeEach(() => {
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

    service = new TransactionsService(
      prisma as never,
      accounts as unknown as AccountsService,
      categories as unknown as CategoriesService,
    );
  });

  function nthCallArg<T>(mockFn: jest.Mock, index: number): T {
    const calls = mockFn.mock.calls as unknown[][];
    return calls[index]?.[0] as T;
  }

  it('creates income transactions with account currency and validated category', async () => {
    prisma.transaction.create.mockResolvedValue(createTransactionRow());

    const result = await service.create(OWNER_ID, {
      postedAt: '2026-04-17T09:00:00.000Z',
      kind: TransactionKind.INCOME,
      amount: 100,
      description: ' Salary ',
      accountId: 'account-1',
      direction: TransactionDirection.INFLOW,
      categoryId: 'category-1',
      counterparty: ' Employer ',
    });

    expect(result.entryType).toBe('STANDARD');
    const createCall = nthCallArg<TransactionCreateCall>(
      prisma.transaction.create,
      0,
    );

    expect(createCall.data).toMatchObject({
      accountId: 'account-1',
      currency: 'EUR',
      categoryId: 'category-1',
      description: 'Salary',
      counterparty: 'Employer',
    });
    expect(createCall.include).toEqual({ account: true, category: true });
  });

  it('creates transfer pairs and returns one logical entry', async () => {
    accounts.getAssignableAccount
      .mockResolvedValueOnce(createAccount({ id: 'source', currency: 'EUR' }))
      .mockResolvedValueOnce(
        createAccount({ id: 'destination', currency: 'EUR' }),
      );
    prisma.transaction.findMany.mockResolvedValue([
      createTransactionRow({
        id: 'row-1',
        accountId: 'source',
        categoryId: null,
        direction: TransactionDirection.OUTFLOW,
        kind: TransactionKind.TRANSFER,
        description: 'Transfer',
        counterparty: null,
        transferGroupId: 'transfer_group',
      }),
      createTransactionRow({
        id: 'row-2',
        accountId: 'destination',
        categoryId: null,
        direction: TransactionDirection.INFLOW,
        kind: TransactionKind.TRANSFER,
        description: 'Transfer',
        counterparty: null,
        transferGroupId: 'transfer_group',
      }),
    ]);

    const result = await service.create(OWNER_ID, {
      postedAt: '2026-04-17T09:00:00.000Z',
      kind: TransactionKind.TRANSFER,
      amount: 25,
      description: 'Transfer',
      sourceAccountId: 'source',
      destinationAccountId: 'destination',
    });

    expect(result.entryType).toBe('TRANSFER');
    expect(prisma.transaction.create).toHaveBeenCalledTimes(2);
  });

  it('enforces same-currency transfers', async () => {
    accounts.getAssignableAccount
      .mockResolvedValueOnce(createAccount({ id: 'source', currency: 'EUR' }))
      .mockResolvedValueOnce(
        createAccount({ id: 'destination', currency: 'USD' }),
      );

    await expect(
      service.create(OWNER_ID, {
        postedAt: '2026-04-17T09:00:00.000Z',
        kind: TransactionKind.TRANSFER,
        amount: 25,
        description: 'Transfer',
        sourceAccountId: 'source',
        destinationAccountId: 'destination',
      }),
    ).rejects.toThrow('same currency');
  });

  it('collapses transfer rows and filters archived accounts from the list', async () => {
    prisma.transaction.findMany.mockResolvedValue([
      createTransactionRow({
        id: 'transfer-out',
        accountId: 'account-1',
        categoryId: null,
        kind: TransactionKind.TRANSFER,
        direction: TransactionDirection.OUTFLOW,
        transferGroupId: 'transfer-1',
        account: createAccount(),
      }),
      createTransactionRow({
        id: 'transfer-in',
        accountId: 'account-2',
        categoryId: null,
        kind: TransactionKind.TRANSFER,
        direction: TransactionDirection.INFLOW,
        transferGroupId: 'transfer-1',
        account: createAccount({
          id: 'account-2',
          archivedAt: new Date('2026-04-17T11:00:00.000Z'),
        }),
      }),
      createTransactionRow({
        id: 'income-1',
        transferGroupId: null,
        kind: TransactionKind.INCOME,
      }),
    ]);

    const activeOnly = await service.findAll(OWNER_ID, {});
    const withArchived = await service.findAll(OWNER_ID, {
      includeArchivedAccounts: true,
    });

    expect(activeOnly).toHaveLength(1);
    expect(withArchived).toHaveLength(2);
  });

  it('builds per-currency cashflow summaries and excludes transfers', async () => {
    prisma.transaction.findMany.mockResolvedValue([
      createTransactionRow({
        id: 'income',
        kind: TransactionKind.INCOME,
        direction: TransactionDirection.INFLOW,
        amount: new Prisma.Decimal('100'),
        currency: 'EUR',
      }),
      createTransactionRow({
        id: 'expense',
        kind: TransactionKind.EXPENSE,
        direction: TransactionDirection.OUTFLOW,
        amount: new Prisma.Decimal('35'),
        categoryId: null,
        category: null,
        currency: 'EUR',
      }),
      createTransactionRow({
        id: 'adjustment',
        kind: TransactionKind.ADJUSTMENT,
        direction: TransactionDirection.OUTFLOW,
        amount: new Prisma.Decimal('5'),
        categoryId: null,
        category: null,
        currency: 'USD',
        accountId: 'account-usd',
        account: createAccount({ id: 'account-usd', currency: 'USD' }),
      }),
    ]);

    const summary = await service.getCashflowSummary(OWNER_ID, {});

    expect(summary).toEqual([
      expect.objectContaining({
        currency: 'EUR',
        incomeTotal: 100,
        expenseTotal: 35,
        netCashflow: 65,
      }),
      expect.objectContaining({
        currency: 'USD',
        adjustmentOutTotal: 5,
        netCashflow: -5,
      }),
    ]);
    expect(summary[0]?.byCategory).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'Salary',
          type: CategoryType.INCOME,
          total: 100,
        }),
        expect.objectContaining({
          name: 'Uncategorized',
          type: CategoryType.EXPENSE,
          total: 35,
        }),
      ]),
    );
  });
});
