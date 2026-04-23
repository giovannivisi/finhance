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

  it('rejects non-transfer transactions before the account opening-balance date', async () => {
    accounts.getAssignableAccount.mockResolvedValue(
      createAccount({
        openingBalanceDate: new Date('2026-04-10T00:00:00.000Z'),
      }),
    );

    await expect(
      service.create(OWNER_ID, {
        postedAt: '2026-04-09T09:00:00.000Z',
        kind: TransactionKind.INCOME,
        amount: 100,
        description: 'Salary',
        accountId: 'account-1',
        direction: TransactionDirection.INFLOW,
      }),
    ).rejects.toThrow('Transactions before 2026-04-10 are not allowed');
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

    await expect(
      service.create(OWNER_ID, {
        postedAt: '2026-04-10T12:00:00.000Z',
        kind: TransactionKind.TRANSFER,
        amount: 25,
        description: 'Transfer',
        sourceAccountId: 'source',
        destinationAccountId: 'destination',
      }),
    ).rejects.toThrow('Transactions before 2026-04-11 are not allowed');
  });

  it('rejects updates and deletes for generated recurring transactions', async () => {
    prisma.transaction.findFirst.mockResolvedValue(
      createTransactionRow({
        recurringRuleId: 'rule-1',
        recurringOccurrenceMonth: new Date('2026-04-01T00:00:00.000Z'),
      }),
    );

    await expect(
      service.update(OWNER_ID, 'transaction-1', {
        postedAt: '2026-04-17T09:00:00.000Z',
        kind: TransactionKind.INCOME,
        amount: 100,
        description: 'Salary',
        accountId: 'account-1',
        direction: TransactionDirection.INFLOW,
      }),
    ).rejects.toThrow('Generated recurring transactions');

    await expect(service.remove(OWNER_ID, 'transaction-1')).rejects.toThrow(
      'Generated recurring transactions',
    );
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

  it('returns the full history when pagination is not requested', async () => {
    prisma.transaction.findMany.mockResolvedValue(
      Array.from({ length: 205 }, (_, index) =>
        createTransactionRow({
          id: `transaction-${index + 1}`,
        }),
      ),
    );

    const result = await service.findAll(OWNER_ID, {});

    expect(result).toHaveLength(205);
    expect(
      nthCallArg<{ where: Record<string, unknown> }>(
        prisma.transaction.findMany,
        0,
      ).where,
    ).toEqual({
      userId: OWNER_ID,
    });
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

  it('applies safe database filters and pagination to transaction history queries', async () => {
    prisma.transaction.findMany.mockResolvedValue([
      createTransactionRow({
        id: 'transaction-1',
        postedAt: new Date('2026-04-17T09:00:00.000Z'),
      }),
      createTransactionRow({
        id: 'transaction-2',
        postedAt: new Date('2026-04-16T09:00:00.000Z'),
      }),
    ]);

    const result = await service.findAll(OWNER_ID, {
      from: '2026-04-01',
      to: '2026-04-30',
      kind: TransactionKind.INCOME,
      categoryId: 'category-1',
      limit: 1,
      offset: 1,
    });

    expect(result).toHaveLength(1);
    expect(result[0]?.entryType).toBe('STANDARD');
    if (result[0]?.entryType !== 'STANDARD') {
      throw new Error('Expected a standard transaction entry.');
    }
    expect(result[0].row.id).toBe('transaction-2');

    expect(
      nthCallArg<{ where: Record<string, unknown> }>(
        prisma.transaction.findMany,
        0,
      ).where,
    ).toMatchObject({
      userId: OWNER_ID,
      kind: TransactionKind.INCOME,
      categoryId: 'category-1',
    });
  });

  it('pushes cashflow account and archive filters into Prisma', async () => {
    prisma.transaction.findMany.mockResolvedValue([createTransactionRow()]);

    await service.getCashflowSummary(OWNER_ID, {
      from: '2026-04-01',
      to: '2026-04-30',
      accountId: 'account-1',
      categoryId: 'category-1',
      includeArchivedAccounts: false,
    });

    expect(
      nthCallArg<{ where: Record<string, unknown> }>(
        prisma.transaction.findMany,
        0,
      ).where,
    ).toMatchObject({
      userId: OWNER_ID,
      accountId: 'account-1',
      categoryId: 'category-1',
      account: {
        archivedAt: null,
      },
    });
  });

  it('builds monthly cashflow buckets, zero-fills empty months, and counts transfers once', async () => {
    prisma.transaction.findMany
      .mockResolvedValueOnce([
        createTransactionRow({
          id: 'income-april',
          postedAt: new Date('2026-03-31T22:30:00.000Z'),
          kind: TransactionKind.INCOME,
          direction: TransactionDirection.INFLOW,
          amount: new Prisma.Decimal('100'),
          currency: 'EUR',
          categoryId: 'category-income',
          category: createCategory({
            id: 'category-income',
            name: 'Salary',
            type: CategoryType.INCOME,
          }),
        }),
        createTransactionRow({
          id: 'expense-april',
          postedAt: new Date('2026-04-10T09:00:00.000Z'),
          kind: TransactionKind.EXPENSE,
          direction: TransactionDirection.OUTFLOW,
          amount: new Prisma.Decimal('40'),
          currency: 'EUR',
          categoryId: 'category-expense',
          category: createCategory({
            id: 'category-expense',
            name: 'Rent',
            type: CategoryType.EXPENSE,
          }),
        }),
        createTransactionRow({
          id: 'uncategorized-expense-april',
          postedAt: new Date('2026-04-12T09:00:00.000Z'),
          kind: TransactionKind.EXPENSE,
          direction: TransactionDirection.OUTFLOW,
          amount: new Prisma.Decimal('15'),
          currency: 'EUR',
          categoryId: null,
          category: null,
        }),
        createTransactionRow({
          id: 'adjustment-april',
          postedAt: new Date('2026-04-15T09:00:00.000Z'),
          kind: TransactionKind.ADJUSTMENT,
          direction: TransactionDirection.OUTFLOW,
          amount: new Prisma.Decimal('7'),
          currency: 'EUR',
          categoryId: null,
          category: null,
        }),
        createTransactionRow({
          id: 'income-may-usd',
          postedAt: new Date('2026-05-03T09:00:00.000Z'),
          kind: TransactionKind.INCOME,
          direction: TransactionDirection.INFLOW,
          amount: new Prisma.Decimal('50'),
          currency: 'USD',
          accountId: 'account-usd',
          account: createAccount({ id: 'account-usd', currency: 'USD' }),
          categoryId: null,
          category: null,
        }),
      ])
      .mockResolvedValueOnce([
        createTransactionRow({
          id: 'transfer-out',
          postedAt: new Date('2026-04-20T09:00:00.000Z'),
          kind: TransactionKind.TRANSFER,
          direction: TransactionDirection.OUTFLOW,
          amount: new Prisma.Decimal('25'),
          currency: 'EUR',
          categoryId: null,
          category: null,
          transferGroupId: 'transfer-1',
        }),
        createTransactionRow({
          id: 'transfer-in',
          postedAt: new Date('2026-04-20T09:00:00.000Z'),
          kind: TransactionKind.TRANSFER,
          direction: TransactionDirection.INFLOW,
          amount: new Prisma.Decimal('25'),
          currency: 'EUR',
          accountId: 'account-2',
          account: createAccount({ id: 'account-2' }),
          categoryId: null,
          category: null,
          transferGroupId: 'transfer-1',
        }),
      ]);

    const summary = await service.getMonthlyCashflow(OWNER_ID, {
      from: '2026-04',
      to: '2026-05',
    });

    expect(summary).toEqual([
      {
        currency: 'EUR',
        averageMonthlyExpense: 27.5,
        rangeExpenseCategories: [
          {
            categoryId: 'category-expense',
            name: 'Rent',
            total: 40,
          },
          {
            categoryId: null,
            name: 'Uncategorized',
            total: 15,
          },
        ],
        months: [
          {
            month: '2026-04',
            incomeTotal: 100,
            expenseTotal: 55,
            netCashflow: 45,
            adjustmentInTotal: 0,
            adjustmentOutTotal: 7,
            transferTotalExcluded: 25,
            uncategorizedExpenseTotal: 15,
            uncategorizedIncomeTotal: 0,
            savingsRate: 0.45,
            expenseCategories: [
              {
                categoryId: 'category-expense',
                name: 'Rent',
                total: 40,
              },
              {
                categoryId: null,
                name: 'Uncategorized',
                total: 15,
              },
            ],
            incomeCategories: [
              {
                categoryId: 'category-income',
                name: 'Salary',
                total: 100,
              },
            ],
          },
          {
            month: '2026-05',
            incomeTotal: 0,
            expenseTotal: 0,
            netCashflow: 0,
            adjustmentInTotal: 0,
            adjustmentOutTotal: 0,
            transferTotalExcluded: 0,
            uncategorizedExpenseTotal: 0,
            uncategorizedIncomeTotal: 0,
            savingsRate: null,
            expenseCategories: [],
            incomeCategories: [],
          },
        ],
      },
      {
        currency: 'USD',
        averageMonthlyExpense: 0,
        rangeExpenseCategories: [],
        months: [
          {
            month: '2026-04',
            incomeTotal: 0,
            expenseTotal: 0,
            netCashflow: 0,
            adjustmentInTotal: 0,
            adjustmentOutTotal: 0,
            transferTotalExcluded: 0,
            uncategorizedExpenseTotal: 0,
            uncategorizedIncomeTotal: 0,
            savingsRate: null,
            expenseCategories: [],
            incomeCategories: [],
          },
          {
            month: '2026-05',
            incomeTotal: 50,
            expenseTotal: 0,
            netCashflow: 50,
            adjustmentInTotal: 0,
            adjustmentOutTotal: 0,
            transferTotalExcluded: 0,
            uncategorizedExpenseTotal: 0,
            uncategorizedIncomeTotal: 50,
            savingsRate: 1,
            expenseCategories: [],
            incomeCategories: [
              {
                categoryId: null,
                name: 'Uncategorized',
                total: 50,
              },
            ],
          },
        ],
      },
    ]);
  });

  it('applies Rome month bounds and repeated account filters to monthly cashflow queries', async () => {
    prisma.transaction.findMany.mockResolvedValue([]);

    await service.getMonthlyCashflow(OWNER_ID, {
      from: '2026-04',
      to: '2026-05',
      accountIds: ['account-1', 'account-2', 'account-1'],
      includeArchivedAccounts: false,
    });

    expect(
      nthCallArg<{ where: Record<string, unknown> }>(
        prisma.transaction.findMany,
        0,
      ).where,
    ).toMatchObject({
      userId: OWNER_ID,
      kind: {
        in: [
          TransactionKind.INCOME,
          TransactionKind.EXPENSE,
          TransactionKind.ADJUSTMENT,
        ],
      },
      accountId: {
        in: ['account-1', 'account-2'],
      },
      account: {
        archivedAt: null,
      },
      postedAt: {
        gte: new Date('2026-03-31T22:00:00.000Z'),
        lt: new Date('2026-05-31T22:00:00.000Z'),
      },
    });
    expect(
      nthCallArg<{ where: Record<string, unknown> }>(
        prisma.transaction.findMany,
        1,
      ).where,
    ).toMatchObject({
      userId: OWNER_ID,
      kind: TransactionKind.TRANSFER,
      accountId: {
        in: ['account-1', 'account-2'],
      },
    });
  });

  it('skips filtered one-sided transfer groups when computing excluded totals', async () => {
    prisma.transaction.findMany
      .mockResolvedValueOnce([
        createTransactionRow({
          id: 'expense-april',
          postedAt: new Date('2026-04-10T09:00:00.000Z'),
          kind: TransactionKind.EXPENSE,
          direction: TransactionDirection.OUTFLOW,
          amount: new Prisma.Decimal('40'),
          currency: 'EUR',
          categoryId: 'category-expense',
          category: createCategory({
            id: 'category-expense',
            name: 'Rent',
            type: CategoryType.EXPENSE,
          }),
        }),
      ])
      .mockResolvedValueOnce([
        createTransactionRow({
          id: 'transfer-out',
          postedAt: new Date('2026-04-20T09:00:00.000Z'),
          kind: TransactionKind.TRANSFER,
          direction: TransactionDirection.OUTFLOW,
          amount: new Prisma.Decimal('25'),
          currency: 'EUR',
          categoryId: null,
          category: null,
          transferGroupId: 'transfer-1',
        }),
      ]);

    const summary = await service.getMonthlyCashflow(OWNER_ID, {
      from: '2026-04',
      to: '2026-04',
      accountIds: ['account-1'],
    });

    expect(summary).toEqual([
      {
        currency: 'EUR',
        averageMonthlyExpense: 40,
        rangeExpenseCategories: [
          {
            categoryId: 'category-expense',
            name: 'Rent',
            total: 40,
          },
        ],
        months: [
          {
            month: '2026-04',
            incomeTotal: 0,
            expenseTotal: 40,
            netCashflow: -40,
            adjustmentInTotal: 0,
            adjustmentOutTotal: 0,
            transferTotalExcluded: 0,
            uncategorizedExpenseTotal: 0,
            uncategorizedIncomeTotal: 0,
            savingsRate: null,
            expenseCategories: [
              {
                categoryId: 'category-expense',
                name: 'Rent',
                total: 40,
              },
            ],
            incomeCategories: [],
          },
        ],
      },
    ]);
  });

  it('builds analytics from monthly cashflow with trends and month-over-month deltas', async () => {
    prisma.transaction.findMany
      .mockResolvedValueOnce([
        createTransactionRow({
          id: 'income-april',
          postedAt: new Date('2026-04-02T09:00:00.000Z'),
          kind: TransactionKind.INCOME,
          direction: TransactionDirection.INFLOW,
          amount: new Prisma.Decimal('100'),
          currency: 'EUR',
          categoryId: 'category-income',
          category: createCategory({
            id: 'category-income',
            name: 'Salary',
            type: CategoryType.INCOME,
          }),
        }),
        createTransactionRow({
          id: 'expense-april-rent',
          postedAt: new Date('2026-04-03T09:00:00.000Z'),
          kind: TransactionKind.EXPENSE,
          direction: TransactionDirection.OUTFLOW,
          amount: new Prisma.Decimal('40'),
          currency: 'EUR',
          categoryId: 'category-rent',
          category: createCategory({
            id: 'category-rent',
            name: 'Rent',
            type: CategoryType.EXPENSE,
          }),
        }),
        createTransactionRow({
          id: 'expense-april-groceries',
          postedAt: new Date('2026-04-05T09:00:00.000Z'),
          kind: TransactionKind.EXPENSE,
          direction: TransactionDirection.OUTFLOW,
          amount: new Prisma.Decimal('10'),
          currency: 'EUR',
          categoryId: 'category-groceries',
          category: createCategory({
            id: 'category-groceries',
            name: 'Groceries',
            type: CategoryType.EXPENSE,
          }),
        }),
        createTransactionRow({
          id: 'adjustment-april',
          postedAt: new Date('2026-04-07T09:00:00.000Z'),
          kind: TransactionKind.ADJUSTMENT,
          direction: TransactionDirection.OUTFLOW,
          amount: new Prisma.Decimal('5'),
          currency: 'EUR',
          categoryId: null,
          category: null,
        }),
        createTransactionRow({
          id: 'income-may',
          postedAt: new Date('2026-05-02T09:00:00.000Z'),
          kind: TransactionKind.INCOME,
          direction: TransactionDirection.INFLOW,
          amount: new Prisma.Decimal('120'),
          currency: 'EUR',
          categoryId: 'category-income',
          category: createCategory({
            id: 'category-income',
            name: 'Salary',
            type: CategoryType.INCOME,
          }),
        }),
        createTransactionRow({
          id: 'expense-may-rent',
          postedAt: new Date('2026-05-03T09:00:00.000Z'),
          kind: TransactionKind.EXPENSE,
          direction: TransactionDirection.OUTFLOW,
          amount: new Prisma.Decimal('50'),
          currency: 'EUR',
          categoryId: 'category-rent',
          category: createCategory({
            id: 'category-rent',
            name: 'Rent',
            type: CategoryType.EXPENSE,
          }),
        }),
        createTransactionRow({
          id: 'expense-may-uncategorized',
          postedAt: new Date('2026-05-04T09:00:00.000Z'),
          kind: TransactionKind.EXPENSE,
          direction: TransactionDirection.OUTFLOW,
          amount: new Prisma.Decimal('15'),
          currency: 'EUR',
          categoryId: null,
          category: null,
        }),
      ])
      .mockResolvedValueOnce([]);

    const summary = await service.getCashflowAnalytics(OWNER_ID, {
      from: '2026-04',
      to: '2026-05',
      includeArchivedAccounts: true,
    });

    expect(summary).toEqual({
      from: '2026-04',
      to: '2026-05',
      focusMonth: '2026-05',
      currencies: [
        {
          currency: 'EUR',
          averageMonthlyExpense: 57.5,
          averageMonthlyIncome: 110,
          monthlySeries: [
            {
              month: '2026-04',
              incomeTotal: 100,
              expenseTotal: 50,
              netCashflow: 50,
              adjustmentInTotal: 0,
              adjustmentOutTotal: 5,
              uncategorizedExpenseTotal: 0,
              uncategorizedIncomeTotal: 0,
            },
            {
              month: '2026-05',
              incomeTotal: 120,
              expenseTotal: 65,
              netCashflow: 55,
              adjustmentInTotal: 0,
              adjustmentOutTotal: 0,
              uncategorizedExpenseTotal: 15,
              uncategorizedIncomeTotal: 0,
            },
          ],
          focusMonthExpenseBreakdown: [
            {
              categoryId: 'category-rent',
              name: 'Rent',
              total: 50,
            },
            {
              categoryId: null,
              name: 'Uncategorized',
              total: 15,
            },
          ],
          focusMonthIncomeBreakdown: [
            {
              categoryId: 'category-income',
              name: 'Salary',
              total: 120,
            },
          ],
          expenseCategoryTrends: [
            {
              categoryId: 'category-rent',
              name: 'Rent',
              total: 90,
              series: [
                { month: '2026-04', total: 40 },
                { month: '2026-05', total: 50 },
              ],
            },
            {
              categoryId: null,
              name: 'Uncategorized',
              total: 15,
              series: [
                { month: '2026-04', total: 0 },
                { month: '2026-05', total: 15 },
              ],
            },
            {
              categoryId: 'category-groceries',
              name: 'Groceries',
              total: 10,
              series: [
                { month: '2026-04', total: 10 },
                { month: '2026-05', total: 0 },
              ],
            },
          ],
          incomeCategoryTrends: [
            {
              categoryId: 'category-income',
              name: 'Salary',
              total: 220,
              series: [
                { month: '2026-04', total: 100 },
                { month: '2026-05', total: 120 },
              ],
            },
          ],
          expenseMonthOverMonthChanges: [
            {
              categoryId: null,
              name: 'Uncategorized',
              previousTotal: 0,
              currentTotal: 15,
              delta: 15,
            },
            {
              categoryId: 'category-groceries',
              name: 'Groceries',
              previousTotal: 10,
              currentTotal: 0,
              delta: -10,
            },
            {
              categoryId: 'category-rent',
              name: 'Rent',
              previousTotal: 40,
              currentTotal: 50,
              delta: 10,
            },
          ],
          incomeMonthOverMonthChanges: [
            {
              categoryId: 'category-income',
              name: 'Salary',
              previousTotal: 100,
              currentTotal: 120,
              delta: 20,
            },
          ],
        },
      ],
    });
  });
});
