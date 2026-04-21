import { BadRequestException } from '@nestjs/common';
import { AccountsService } from '@accounts/accounts.service';
import { Prisma } from '@prisma/client';
import {
  CategoryType,
  NetWorthSnapshot,
  RecurringTransactionRule,
  TransactionDirection,
  TransactionKind,
} from '@prisma/client';
import { RecurringService } from '@recurring/recurring.service';
import { CategoriesService } from '@transactions/categories.service';
import { TransactionsService } from '@transactions/transactions.service';

const OWNER_ID = 'local-dev';

function createAccount(overrides: Partial<Record<string, unknown>> = {}) {
  const now = new Date('2026-04-21T10:00:00.000Z');

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
  const now = new Date('2026-04-21T10:00:00.000Z');

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

function createRecurringRule(
  overrides: Partial<RecurringTransactionRule> = {},
): RecurringTransactionRule {
  const now = new Date('2026-04-21T10:00:00.000Z');

  return {
    id: 'rule-1',
    userId: OWNER_ID,
    name: 'Salary',
    isActive: true,
    kind: TransactionKind.INCOME,
    amount: new Prisma.Decimal('100'),
    dayOfMonth: 15,
    startDate: new Date('2026-04-01T00:00:00.000Z'),
    endDate: null,
    accountId: 'account-1',
    direction: TransactionDirection.INFLOW,
    categoryId: 'category-1',
    counterparty: 'Employer',
    sourceAccountId: null,
    destinationAccountId: null,
    description: 'Salary',
    notes: null,
    lastMaterializationError: null,
    lastMaterializationErrorAt: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function createSnapshot(
  overrides: Partial<NetWorthSnapshot> = {},
): NetWorthSnapshot {
  const now = new Date('2026-04-21T10:00:00.000Z');

  return {
    id: 'snapshot-1',
    userId: OWNER_ID,
    snapshotDate: new Date('2026-03-31T00:00:00.000Z'),
    capturedAt: now,
    baseCurrency: 'EUR',
    assetsTotal: new Prisma.Decimal('1200'),
    liabilitiesTotal: new Prisma.Decimal('200'),
    netWorthTotal: new Prisma.Decimal('1000'),
    unavailableCount: 0,
    isPartial: false,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe('RecurringService', () => {
  let service: RecurringService;
  let prisma: {
    recurringTransactionRule: {
      findMany: jest.Mock;
      findFirst: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
    transaction: {
      findMany: jest.Mock;
      create: jest.Mock;
    };
    netWorthSnapshot: {
      findFirst: jest.Mock;
    };
  };
  let accounts: {
    getAssignableAccount: jest.Mock;
    findReconciliation: jest.Mock;
  };
  let categories: {
    getAssignableCategory: jest.Mock;
  };
  let transactions: {
    getCashflowSummary: jest.Mock;
  };

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-04-21T10:00:00.000Z'));

    prisma = {
      recurringTransactionRule: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      transaction: {
        findMany: jest.fn(),
        create: jest.fn(),
      },
      netWorthSnapshot: {
        findFirst: jest.fn(),
      },
    };

    accounts = {
      getAssignableAccount: jest.fn().mockResolvedValue(createAccount()),
      findReconciliation: jest.fn().mockResolvedValue([]),
    };

    categories = {
      getAssignableCategory: jest.fn().mockResolvedValue(createCategory()),
    };

    transactions = {
      getCashflowSummary: jest.fn().mockResolvedValue([]),
    };

    service = new RecurringService(
      prisma as never,
      accounts as unknown as AccountsService,
      categories as unknown as CategoriesService,
      transactions as unknown as TransactionsService,
    );
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  function nthCreateCall(index: number): {
    data: {
      recurringOccurrenceMonth?: Date;
      postedAt?: Date;
    };
  } {
    const calls = prisma.transaction.create.mock.calls as unknown[][];
    return calls[index]?.[0] as {
      data: {
        recurringOccurrenceMonth?: Date;
        postedAt?: Date;
      };
    };
  }

  function firstRuleUpdateCall(): {
    where: { id: string };
    data: {
      lastMaterializationError?: string | null;
    };
  } {
    const calls = prisma.recurringTransactionRule.update.mock
      .calls as unknown[][];
    return calls[0]?.[0] as {
      where: { id: string };
      data: {
        lastMaterializationError?: string | null;
      };
    };
  }

  it('materializes catch-up monthly rows and clamps the 31st on short months', async () => {
    prisma.recurringTransactionRule.findMany.mockResolvedValue([
      createRecurringRule({
        kind: TransactionKind.EXPENSE,
        direction: TransactionDirection.OUTFLOW,
        amount: new Prisma.Decimal('42'),
        dayOfMonth: 31,
        startDate: new Date('2026-02-01T00:00:00.000Z'),
        accountId: 'account-1',
        categoryId: null,
        counterparty: null,
        description: 'Rent',
        notes: null,
      }),
    ]);
    prisma.transaction.findMany.mockResolvedValue([]);
    prisma.transaction.create.mockResolvedValue({});
    prisma.recurringTransactionRule.update.mockResolvedValue(
      createRecurringRule(),
    );
    accounts.getAssignableAccount.mockResolvedValue(createAccount());

    const result = await service.materialize(OWNER_ID);

    expect(result).toEqual({
      createdCount: 3,
      processedRuleCount: 1,
      failedRuleCount: 0,
    });
    expect(prisma.transaction.create).toHaveBeenCalledTimes(3);
    expect(
      nthCreateCall(0)
        .data.recurringOccurrenceMonth?.toISOString()
        .slice(0, 10),
    ).toBe('2026-02-01');
    expect(nthCreateCall(0).data.postedAt?.toISOString().slice(0, 10)).toBe(
      '2026-02-28',
    );
    expect(nthCreateCall(1).data.postedAt?.toISOString().slice(0, 10)).toBe(
      '2026-03-31',
    );
    expect(nthCreateCall(2).data.postedAt?.toISOString().slice(0, 10)).toBe(
      '2026-04-30',
    );
  });

  it('materializes transfer pairs exactly once per month', async () => {
    const rule = createRecurringRule({
      kind: TransactionKind.TRANSFER,
      direction: null,
      accountId: null,
      categoryId: null,
      counterparty: null,
      sourceAccountId: 'source-account',
      destinationAccountId: 'destination-account',
      description: 'Monthly move',
    });

    prisma.recurringTransactionRule.findMany.mockResolvedValue([rule]);
    prisma.recurringTransactionRule.update.mockResolvedValue(rule);
    accounts.getAssignableAccount
      .mockResolvedValueOnce(createAccount({ id: 'source-account' }))
      .mockResolvedValueOnce(createAccount({ id: 'destination-account' }));
    prisma.transaction.findMany.mockResolvedValueOnce([]);
    prisma.transaction.create.mockResolvedValue({});

    const firstRun = await service.materialize(OWNER_ID);

    expect(firstRun.createdCount).toBe(2);
    expect(prisma.transaction.create).toHaveBeenCalledTimes(2);

    prisma.transaction.create.mockClear();
    accounts.getAssignableAccount
      .mockResolvedValueOnce(createAccount({ id: 'source-account' }))
      .mockResolvedValueOnce(createAccount({ id: 'destination-account' }));
    prisma.transaction.findMany.mockResolvedValueOnce([
      {
        recurringRuleId: 'rule-1',
        recurringOccurrenceMonth: new Date('2026-04-01T00:00:00.000Z'),
        direction: TransactionDirection.OUTFLOW,
      },
      {
        recurringRuleId: 'rule-1',
        recurringOccurrenceMonth: new Date('2026-04-01T00:00:00.000Z'),
        direction: TransactionDirection.INFLOW,
      },
    ]);

    const secondRun = await service.materialize(OWNER_ID);

    expect(secondRun.createdCount).toBe(0);
    expect(prisma.transaction.create).not.toHaveBeenCalled();
  });

  it('records a materialization error and continues when a rule becomes invalid', async () => {
    prisma.recurringTransactionRule.findMany.mockResolvedValue([
      createRecurringRule({
        kind: TransactionKind.EXPENSE,
        direction: TransactionDirection.OUTFLOW,
        accountId: 'archived-account',
        categoryId: null,
      }),
    ]);
    prisma.transaction.findMany.mockResolvedValue([]);
    accounts.getAssignableAccount.mockRejectedValue(
      new BadRequestException('Archived accounts cannot be newly assigned.'),
    );

    const result = await service.materialize(OWNER_ID);

    expect(result).toEqual({
      createdCount: 0,
      processedRuleCount: 1,
      failedRuleCount: 1,
    });
    expect(firstRuleUpdateCall()).toMatchObject({
      where: { id: 'rule-1' },
      data: {
        lastMaterializationError: 'Archived accounts cannot be newly assigned.',
      },
    });
  });

  it('returns a month-bounded review with snapshot delta and reconciliation highlights', async () => {
    transactions.getCashflowSummary.mockResolvedValue([
      {
        currency: 'EUR',
        incomeTotal: 2000,
        expenseTotal: 800,
        adjustmentInTotal: 0,
        adjustmentOutTotal: 0,
        netCashflow: 1200,
        byCategory: [],
        byAccount: [],
      },
    ]);
    prisma.netWorthSnapshot.findFirst
      .mockResolvedValueOnce(
        createSnapshot({
          id: 'opening',
          snapshotDate: new Date('2026-03-31T00:00:00.000Z'),
          netWorthTotal: new Prisma.Decimal('1000'),
        }),
      )
      .mockResolvedValueOnce(
        createSnapshot({
          id: 'closing',
          snapshotDate: new Date('2026-04-30T00:00:00.000Z'),
          netWorthTotal: new Prisma.Decimal('1300'),
        }),
      );
    accounts.findReconciliation.mockResolvedValue([
      {
        account: createAccount(),
        status: 'CLEAN',
        trackedBalance: new Prisma.Decimal('100'),
        expectedBalance: new Prisma.Decimal('100'),
        delta: new Prisma.Decimal('0'),
        assetCount: 1,
        transactionCount: 1,
        issueCodes: [],
        canCreateAdjustment: false,
      },
      {
        account: createAccount({ id: 'account-2', name: 'Broker' }),
        status: 'MISMATCH',
        trackedBalance: new Prisma.Decimal('900'),
        expectedBalance: new Prisma.Decimal('750'),
        delta: new Prisma.Decimal('150'),
        assetCount: 1,
        transactionCount: 2,
        issueCodes: [],
        canCreateAdjustment: true,
      },
    ]);

    const review = await service.getMonthlyReview(OWNER_ID, '2026-04');

    expect(transactions.getCashflowSummary).toHaveBeenCalledWith(OWNER_ID, {
      from: '2026-04-01',
      to: '2026-04-30',
      includeArchivedAccounts: true,
    });
    expect(review.openingNetWorth).toBe(1000);
    expect(review.closingNetWorth).toBe(1300);
    expect(review.netWorthDelta).toBe(300);
    expect(review.reconciliationHighlights).toHaveLength(1);
    expect(review.reconciliationHighlights[0]?.accountName).toBe('Broker');
  });
});
