import { BadRequestException } from '@nestjs/common';
import { AccountsService } from '@accounts/accounts.service';
import { Prisma } from '@prisma/client';
import {
  CategoryType,
  NetWorthSnapshot,
  RecurringOccurrenceStatus,
  RecurringTransactionRule,
  TransactionDirection,
  TransactionKind,
} from '@prisma/client';
import type { MonthlyCashflowResponse } from '@finhance/shared';
import { RecurringService } from '@recurring/recurring.service';
import { CategoriesService } from '@transactions/categories.service';
import { TransactionsService } from '@transactions/transactions.service';

const OWNER_ID = 'local-dev';
const USER_VISIBLE_MATERIALIZATION_ERROR =
  'Unable to materialize this recurring rule. Review the rule configuration and try again.';

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

function createOccurrenceModel(
  rule: RecurringTransactionRule,
  overrides: Partial<Record<string, unknown>> = {},
) {
  const now = new Date('2026-04-21T10:00:00.000Z');

  return {
    id: 'occurrence-1',
    userId: OWNER_ID,
    recurringRuleId: rule.id,
    occurrenceMonth: new Date('2026-04-01T00:00:00.000Z'),
    status: RecurringOccurrenceStatus.SKIPPED,
    overrideAmount: null,
    overridePostedAtDate: null,
    overrideAccountId: null,
    overrideDirection: null,
    overrideCategoryId: null,
    overrideCounterparty: null,
    overrideSourceAccountId: null,
    overrideDestinationAccountId: null,
    overrideDescription: null,
    overrideNotes: null,
    createdAt: now,
    updatedAt: now,
    recurringRule: rule,
    ...overrides,
  };
}

describe('RecurringService', () => {
  let service: RecurringService;
  let prisma: {
    $transaction: jest.Mock;
    recurringTransactionRule: {
      findMany: jest.Mock;
      findFirst: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
    recurringTransactionOccurrence: {
      findMany: jest.Mock;
      findFirst: jest.Mock;
      upsert: jest.Mock;
      deleteMany: jest.Mock;
    };
    transaction: {
      findMany: jest.Mock;
      create: jest.Mock;
      deleteMany: jest.Mock;
    };
    netWorthSnapshot: {
      findFirst: jest.Mock;
    };
  };
  let accounts: {
    getAssignableAccount: jest.Mock;
    findAll: jest.Mock;
    findReconciliation: jest.Mock;
  };
  let categories: {
    getAssignableCategory: jest.Mock;
  };
  let transactions: {
    getCashflowSummary: jest.Mock;
    getMonthlyCashflow: jest.Mock;
  };

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-04-21T10:00:00.000Z'));

    prisma = {
      $transaction: jest.fn(),
      recurringTransactionRule: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      recurringTransactionOccurrence: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        upsert: jest.fn(),
        deleteMany: jest.fn(),
      },
      transaction: {
        findMany: jest.fn(),
        create: jest.fn(),
        deleteMany: jest.fn(),
      },
      netWorthSnapshot: {
        findFirst: jest.fn(),
      },
    };

    accounts = {
      getAssignableAccount: jest.fn().mockResolvedValue(createAccount()),
      findAll: jest.fn().mockResolvedValue([createAccount()]),
      findReconciliation: jest.fn().mockResolvedValue([]),
    };

    categories = {
      getAssignableCategory: jest.fn().mockResolvedValue(createCategory()),
    };

    transactions = {
      getCashflowSummary: jest.fn().mockResolvedValue([]),
      getMonthlyCashflow: jest.fn().mockResolvedValue([]),
    };

    prisma.recurringTransactionOccurrence.findMany.mockResolvedValue([]);
    prisma.recurringTransactionOccurrence.findFirst.mockResolvedValue(null);
    prisma.$transaction.mockImplementation(
      (callback: (client: typeof prisma) => unknown) => callback(prisma),
    );

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
    expect(prisma.$transaction).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      }),
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
        lastMaterializationError: USER_VISIBLE_MATERIALIZATION_ERROR,
      },
    });
  });

  it('rejects recurring rules whose start date exceeds the backfill window', async () => {
    await expect(
      service.create(OWNER_ID, {
        name: 'Old rent',
        kind: TransactionKind.EXPENSE,
        amount: 42,
        dayOfMonth: 1,
        startDate: '2024-04-01',
        accountId: 'account-1',
        direction: TransactionDirection.OUTFLOW,
        description: 'Old rent',
      }),
    ).rejects.toThrow('24 months in the past');
  });

  it('skips a due occurrence and removes generated recurring rows', async () => {
    const rule = createRecurringRule({
      kind: TransactionKind.EXPENSE,
      direction: TransactionDirection.OUTFLOW,
      categoryId: null,
      counterparty: null,
      description: 'Rent',
    });

    prisma.recurringTransactionRule.findFirst.mockResolvedValue(rule);
    prisma.recurringTransactionOccurrence.upsert.mockResolvedValue(
      createOccurrenceModel(rule, {
        status: RecurringOccurrenceStatus.SKIPPED,
      }),
    );
    prisma.transaction.deleteMany.mockResolvedValue({ count: 1 });
    prisma.recurringTransactionRule.update.mockResolvedValue(rule);

    const occurrence = await service.upsertOccurrence(
      OWNER_ID,
      rule.id,
      '2026-04',
      {
        status: 'SKIPPED',
      },
    );

    expect(occurrence.status).toBe('SKIPPED');
    expect(prisma.transaction.deleteMany).toHaveBeenCalledWith({
      where: {
        userId: OWNER_ID,
        recurringRuleId: rule.id,
        recurringOccurrenceMonth: new Date('2026-04-01T00:00:00.000Z'),
      },
    });
    expect(prisma.transaction.create).not.toHaveBeenCalled();
  });

  it('overrides transfer occurrences by recreating both recurring rows', async () => {
    const rule = createRecurringRule({
      kind: TransactionKind.TRANSFER,
      direction: null,
      accountId: null,
      categoryId: null,
      counterparty: null,
      sourceAccountId: 'source-account',
      destinationAccountId: 'destination-account',
      description: 'Broker move',
    });

    prisma.recurringTransactionRule.findFirst.mockResolvedValue(rule);
    accounts.getAssignableAccount
      .mockResolvedValueOnce(
        createAccount({ id: 'source-account', currency: 'EUR' }),
      )
      .mockResolvedValueOnce(
        createAccount({ id: 'destination-account', currency: 'EUR' }),
      );
    prisma.recurringTransactionOccurrence.upsert.mockResolvedValue(
      createOccurrenceModel(rule, {
        status: RecurringOccurrenceStatus.OVERRIDDEN,
        overrideAmount: new Prisma.Decimal('250'),
        overridePostedAtDate: new Date('2026-04-20T00:00:00.000Z'),
        overrideSourceAccountId: 'source-account',
        overrideDestinationAccountId: 'destination-account',
        overrideDescription: 'Broker move override',
      }),
    );
    prisma.transaction.deleteMany.mockResolvedValue({ count: 2 });
    prisma.transaction.create.mockResolvedValue({});
    prisma.recurringTransactionRule.update.mockResolvedValue(rule);

    await service.upsertOccurrence(OWNER_ID, rule.id, '2026-04', {
      status: 'OVERRIDDEN',
      amount: 250,
      postedAtDate: '2026-04-20',
      sourceAccountId: 'source-account',
      destinationAccountId: 'destination-account',
      description: 'Broker move override',
    });

    expect(prisma.transaction.create).toHaveBeenCalledTimes(2);
    const createCalls = prisma.transaction.create.mock.calls as Array<
      [{ data: Record<string, unknown> }]
    >;
    expect(createCalls[0]?.[0]).toMatchObject({
      data: {
        recurringRuleId: rule.id,
        direction: TransactionDirection.OUTFLOW,
      },
    });
    expect(createCalls[1]?.[0]).toMatchObject({
      data: {
        recurringRuleId: rule.id,
        direction: TransactionDirection.INFLOW,
      },
    });
  });

  it('rejects overrides whose posted date leaves the selected month', async () => {
    const rule = createRecurringRule({
      kind: TransactionKind.EXPENSE,
      direction: TransactionDirection.OUTFLOW,
      categoryId: null,
      counterparty: null,
    });

    prisma.recurringTransactionRule.findFirst.mockResolvedValue(rule);

    await expect(
      service.upsertOccurrence(OWNER_ID, rule.id, '2026-04', {
        status: 'OVERRIDDEN',
        amount: 120,
        postedAtDate: '2026-05-01',
        accountId: 'account-1',
        direction: 'OUTFLOW',
        description: 'Bad override',
      }),
    ).rejects.toThrow('selected occurrence month');
  });

  it('rejects overrides with impossible calendar dates', async () => {
    const rule = createRecurringRule({
      kind: TransactionKind.EXPENSE,
      direction: TransactionDirection.OUTFLOW,
      categoryId: null,
      counterparty: null,
      startDate: new Date('2026-02-01T00:00:00.000Z'),
    });

    prisma.recurringTransactionRule.findFirst.mockResolvedValue(rule);

    await expect(
      service.upsertOccurrence(OWNER_ID, rule.id, '2026-02', {
        status: 'OVERRIDDEN',
        amount: 120,
        postedAtDate: '2026-02-31',
        accountId: 'account-1',
        direction: 'OUTFLOW',
        description: 'Bad override',
      }),
    ).rejects.toThrow('postedAtDate is invalid');
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
    transactions.getMonthlyCashflow.mockResolvedValue([
      {
        currency: 'EUR',
        averageMonthlyExpense: 800,
        rangeExpenseCategories: [],
        months: [
          {
            month: '2026-04',
            incomeTotal: 2000,
            expenseTotal: 800,
            netCashflow: 1200,
            adjustmentInTotal: 0,
            adjustmentOutTotal: 0,
            transferTotalExcluded: 0,
            uncategorizedExpenseTotal: 0,
            uncategorizedIncomeTotal: 0,
            savingsRate: 0.6,
            expenseCategories: [],
            incomeCategories: [],
          },
        ],
      },
    ] satisfies MonthlyCashflowResponse);
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
    prisma.recurringTransactionOccurrence.findMany.mockResolvedValue([
      createOccurrenceModel(createRecurringRule(), {
        status: RecurringOccurrenceStatus.SKIPPED,
      }),
    ]);
    prisma.recurringTransactionRule.findMany.mockResolvedValue([
      createRecurringRule(),
    ]);
    prisma.transaction.findMany.mockResolvedValue([]);

    const review = await service.getMonthlyReview(OWNER_ID, '2026-04');

    expect(transactions.getCashflowSummary).toHaveBeenCalledWith(OWNER_ID, {
      from: '2026-04-01',
      to: '2026-04-30',
      includeArchivedAccounts: true,
    });
    expect(transactions.getMonthlyCashflow).toHaveBeenCalledWith(OWNER_ID, {
      from: '2026-04',
      to: '2026-04',
      includeArchivedAccounts: true,
    });
    expect(review.openingNetWorth).toBe(1000);
    expect(review.closingNetWorth).toBe(1300);
    expect(review.netWorthDelta).toBe(300);
    expect(review.netWorthExplanation).toEqual({
      isComparableInEur: true,
      cashflowContributionEur: 1200,
      valuationMovementEur: -900,
      note: 'Valuation movement is the portion of the EUR net worth delta not explained by EUR cashflow.',
    });
    expect(review.reconciliationHighlights).toHaveLength(1);
    expect(review.reconciliationHighlights[0]?.accountName).toBe('Broker');
    expect(review.recurringExceptions).toHaveLength(1);
    expect(review.recurringExceptions[0]?.status).toBe('SKIPPED');
    expect(review.recurringComparison).toEqual([
      {
        currency: 'EUR',
        expectedIncomeTotal: 100,
        actualIncomeTotal: 0,
        expectedExpenseTotal: 0,
        actualExpenseTotal: 0,
        dueRuleCount: 1,
        realizedRuleCount: 0,
        skippedCount: 1,
        overriddenCount: 0,
        transferRulesExcludedCount: 0,
      },
    ]);
    expect(review.currencyInsights).toEqual([
      {
        currency: 'EUR',
        savingsRate: 0.6,
        uncategorizedExpenseTotal: 0,
        uncategorizedIncomeTotal: 0,
        topExpenseCategories: [],
        topIncomeCategories: [],
        topAccounts: [],
      },
    ]);
    expect(review.warnings).toEqual([
      {
        code: 'RECONCILIATION_ISSUES',
        severity: 'WARNING',
        title: 'Reconciliation needs attention',
        detail:
          'One or more accounts still have mismatches or unsupported reconciliation state.',
        count: 1,
        amount: null,
        currency: null,
      },
      {
        code: 'RECURRING_EXCEPTIONS_PRESENT',
        severity: 'INFO',
        title: 'Recurring exceptions saved for this month',
        detail:
          'This month includes skipped or overridden recurring occurrences that change the expected schedule.',
        count: 1,
        amount: null,
        currency: null,
      },
    ]);
  });

  it('adds snapshot, non-EUR, and uncategorized warnings when the review cannot be explained safely in EUR', async () => {
    transactions.getCashflowSummary.mockResolvedValue([
      {
        currency: 'EUR',
        incomeTotal: 100,
        expenseTotal: 20,
        adjustmentInTotal: 0,
        adjustmentOutTotal: 0,
        netCashflow: 80,
        byCategory: [],
        byAccount: [],
      },
      {
        currency: 'USD',
        incomeTotal: 0,
        expenseTotal: 40,
        adjustmentInTotal: 0,
        adjustmentOutTotal: 0,
        netCashflow: -40,
        byCategory: [],
        byAccount: [
          {
            accountId: 'account-usd',
            name: 'USD account',
            inflowTotal: 0,
            outflowTotal: 40,
            netCashflow: -40,
          },
        ],
      },
    ]);
    transactions.getMonthlyCashflow.mockResolvedValue([
      {
        currency: 'USD',
        averageMonthlyExpense: 40,
        rangeExpenseCategories: [],
        months: [
          {
            month: '2026-04',
            incomeTotal: 0,
            expenseTotal: 40,
            netCashflow: -40,
            adjustmentInTotal: 0,
            adjustmentOutTotal: 0,
            transferTotalExcluded: 0,
            uncategorizedExpenseTotal: 10,
            uncategorizedIncomeTotal: 0,
            savingsRate: null,
            expenseCategories: [
              {
                categoryId: 'category-rent',
                name: 'Rent',
                total: 30,
              },
              {
                categoryId: null,
                name: 'Uncategorized',
                total: 10,
              },
            ],
            incomeCategories: [],
          },
        ],
      },
    ] satisfies MonthlyCashflowResponse);
    prisma.netWorthSnapshot.findFirst
      .mockResolvedValueOnce(
        createSnapshot({
          isPartial: true,
          unavailableCount: 2,
        }),
      )
      .mockResolvedValueOnce(null);
    accounts.findReconciliation.mockResolvedValue([]);
    prisma.recurringTransactionOccurrence.findMany.mockResolvedValue([]);
    prisma.recurringTransactionRule.findMany.mockResolvedValue([]);
    prisma.transaction.findMany.mockResolvedValue([]);

    const review = await service.getMonthlyReview(OWNER_ID, '2026-04');

    expect(review.netWorthExplanation).toEqual({
      isComparableInEur: false,
      cashflowContributionEur: null,
      valuationMovementEur: null,
      note: 'Add both opening and closing snapshot boundaries to explain the month in EUR.',
    });
    expect(review.currencyInsights).toEqual([
      {
        currency: 'EUR',
        savingsRate: null,
        uncategorizedExpenseTotal: 0,
        uncategorizedIncomeTotal: 0,
        topExpenseCategories: [],
        topIncomeCategories: [],
        topAccounts: [],
      },
      {
        currency: 'USD',
        savingsRate: null,
        uncategorizedExpenseTotal: 10,
        uncategorizedIncomeTotal: 0,
        topExpenseCategories: [
          {
            categoryId: 'category-rent',
            name: 'Rent',
            total: 30,
          },
          {
            categoryId: null,
            name: 'Uncategorized',
            total: 10,
          },
        ],
        topIncomeCategories: [],
        topAccounts: [
          {
            accountId: 'account-usd',
            name: 'USD account',
            inflowTotal: 0,
            outflowTotal: 40,
            netCashflow: -40,
          },
        ],
      },
    ]);
    expect(review.warnings).toEqual([
      {
        code: 'PARTIAL_OPENING_SNAPSHOT',
        severity: 'WARNING',
        title: 'Opening snapshot is partial',
        detail:
          'The opening boundary excludes unavailable valuations, so month-over-month comparisons are incomplete.',
        count: 2,
        amount: null,
        currency: null,
      },
      {
        code: 'MISSING_CLOSING_SNAPSHOT',
        severity: 'WARNING',
        title: 'Closing snapshot missing',
        detail:
          'Capture a snapshot in this month to anchor the closing net worth boundary.',
        count: null,
        amount: null,
        currency: null,
      },
      {
        code: 'NON_EUR_CASHFLOW_NOT_COMPARABLE',
        severity: 'INFO',
        title: 'USD cashflow excluded from EUR explanation',
        detail:
          'This month includes non-EUR cashflow, so the net worth delta cannot be decomposed into one EUR story.',
        count: null,
        amount: -40,
        currency: 'USD',
      },
      {
        code: 'UNCATEGORIZED_EXPENSES',
        severity: 'WARNING',
        title: 'Uncategorized expenses in USD',
        detail:
          'Some expense transactions are still uncategorized, so category drivers are incomplete.',
        count: null,
        amount: 10,
        currency: 'USD',
      },
    ]);
  });
});
