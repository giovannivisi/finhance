import { Prisma } from '@prisma/client';
import {
  CategoryType,
  TransactionDirection,
  TransactionKind,
} from '@prisma/client';
import { BudgetsService } from '@budgets/budgets.service';

const OWNER_ID = 'local-dev';

function createCategory(overrides: Partial<Record<string, unknown>> = {}) {
  const now = new Date('2026-04-23T10:00:00.000Z');

  return {
    id: 'category-1',
    userId: OWNER_ID,
    name: 'Groceries',
    type: CategoryType.EXPENSE,
    order: 0,
    archivedAt: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function createBudget(overrides: Partial<Record<string, unknown>> = {}) {
  const now = new Date('2026-04-23T10:00:00.000Z');

  return {
    id: 'budget-1',
    userId: OWNER_ID,
    categoryId: 'category-1',
    currency: 'EUR',
    amount: new Prisma.Decimal('100'),
    startMonth: new Date('2026-04-01T00:00:00.000Z'),
    endMonth: null,
    createdAt: now,
    updatedAt: now,
    category: createCategory(),
    overrides: [],
    ...overrides,
  };
}

function createOverride(overrides: Partial<Record<string, unknown>> = {}) {
  const now = new Date('2026-04-23T10:00:00.000Z');

  return {
    id: 'override-1',
    userId: OWNER_ID,
    categoryBudgetId: 'budget-1',
    month: new Date('2026-04-01T00:00:00.000Z'),
    amount: new Prisma.Decimal('90'),
    note: 'Carryover',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function createExpenseRow(overrides: Partial<Record<string, unknown>> = {}) {
  const now = new Date('2026-04-23T10:00:00.000Z');

  return {
    id: 'transaction-1',
    userId: OWNER_ID,
    postedAt: new Date('2026-04-10T10:00:00.000Z'),
    accountId: 'account-1',
    categoryId: 'category-1',
    amount: new Prisma.Decimal('120'),
    currency: 'EUR',
    direction: TransactionDirection.OUTFLOW,
    kind: TransactionKind.EXPENSE,
    description: 'Groceries',
    notes: null,
    counterparty: null,
    transferGroupId: null,
    createdAt: now,
    updatedAt: now,
    recurringRuleId: null,
    recurringOccurrenceMonth: null,
    account: null,
    category: createCategory(),
    ...overrides,
  };
}

describe('BudgetsService', () => {
  let service: BudgetsService;
  let prisma: {
    $transaction: jest.Mock;
    categoryBudget: {
      findMany: jest.Mock;
      findFirst: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
    };
    categoryBudgetOverride: {
      findMany: jest.Mock;
      upsert: jest.Mock;
      deleteMany: jest.Mock;
      updateMany: jest.Mock;
    };
    transaction: {
      findMany: jest.Mock;
    };
  };
  let categories: {
    findOne: jest.Mock;
  };

  beforeEach(() => {
    prisma = {
      $transaction: jest.fn(),
      categoryBudget: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      categoryBudgetOverride: {
        findMany: jest.fn(),
        upsert: jest.fn(),
        deleteMany: jest.fn(),
        updateMany: jest.fn(),
      },
      transaction: {
        findMany: jest.fn(),
      },
    };

    prisma.$transaction.mockImplementation(
      async (
        callback: (tx: {
          categoryBudget: typeof prisma.categoryBudget;
          categoryBudgetOverride: typeof prisma.categoryBudgetOverride;
        }) => Promise<unknown>,
      ) =>
        callback({
          categoryBudget: prisma.categoryBudget,
          categoryBudgetOverride: prisma.categoryBudgetOverride,
        }),
    );

    categories = {
      findOne: jest.fn().mockResolvedValue(createCategory()),
    };

    service = new BudgetsService(prisma as never, categories as never);
  });

  it('rejects non-expense categories for budgets', async () => {
    categories.findOne.mockResolvedValue(
      createCategory({
        type: CategoryType.INCOME,
      }),
    );

    await expect(
      service.create(OWNER_ID, {
        categoryId: 'category-1',
        currency: 'EUR',
        amount: 100,
        startMonth: '2026-04',
      }),
    ).rejects.toThrow('Budgets can only be assigned to expense categories.');
  });

  it('rejects overlapping repeating budgets', async () => {
    prisma.categoryBudget.findFirst.mockResolvedValue(createBudget());

    await expect(
      service.create(OWNER_ID, {
        categoryId: 'category-1',
        currency: 'EUR',
        amount: 100,
        startMonth: '2026-04',
      }),
    ).rejects.toThrow(
      'Budget ranges cannot overlap for the same category and currency.',
    );
  });

  it('builds monthly budgets with overrides, unbudgeted expense, and uncategorized expense kept separate', async () => {
    prisma.categoryBudget.findMany.mockResolvedValue([
      createBudget({
        overrides: [createOverride()],
      }),
    ]);
    prisma.transaction.findMany.mockResolvedValue([
      createExpenseRow(),
      createExpenseRow({
        id: 'prev-month',
        postedAt: new Date('2026-03-11T10:00:00.000Z'),
        amount: new Prisma.Decimal('60'),
      }),
      createExpenseRow({
        id: 'two-months-back',
        postedAt: new Date('2026-02-12T10:00:00.000Z'),
        amount: new Prisma.Decimal('30'),
      }),
      createExpenseRow({
        id: 'unbudgeted',
        categoryId: 'category-2',
        amount: new Prisma.Decimal('30'),
        category: createCategory({
          id: 'category-2',
          name: 'Dining',
          order: 1,
        }),
      }),
      createExpenseRow({
        id: 'uncategorized',
        categoryId: null,
        amount: new Prisma.Decimal('10'),
        category: null,
      }),
    ]);

    const result = await service.findMonthly(OWNER_ID, '2026-04', {
      includeArchivedCategories: true,
    });

    expect(result.month).toBe('2026-04');
    expect(result.currencies).toEqual([
      {
        currency: 'EUR',
        budgetTotal: 90,
        spentTotal: 120,
        remainingTotal: -30,
        overBudgetTotal: 30,
        overBudgetCount: 1,
        budgetedCategoryCount: 1,
        unbudgetedExpenseTotal: 30,
        uncategorizedExpenseTotal: 10,
        items: [
          {
            budgetId: 'budget-1',
            categoryId: 'category-1',
            categoryName: 'Groceries',
            categoryArchivedAt: null,
            currency: 'EUR',
            budgetAmount: 90,
            spentAmount: 120,
            remainingAmount: -30,
            usageRatio: 120 / 90,
            status: 'OVER_BUDGET',
            previousMonthExpense: 60,
            averageExpenseLast3Months: 30,
            startMonth: '2026-04',
            endMonth: null,
            override: {
              id: 'override-1',
              categoryBudgetId: 'budget-1',
              month: '2026-04',
              amount: 90,
              note: 'Carryover',
              createdAt: expect.any(String) as unknown as string,
              updatedAt: expect.any(String) as unknown as string,
            },
          },
        ],
        overBudgetHighlights: [
          expect.objectContaining({
            budgetId: 'budget-1',
            status: 'OVER_BUDGET',
          }),
        ],
        unbudgetedCategories: [
          {
            categoryId: 'category-2',
            categoryName: 'Dining',
            categoryArchivedAt: null,
            currency: 'EUR',
            spentAmount: 30,
            previousMonthExpense: null,
            averageExpenseLast3Months: null,
          },
        ],
      },
    ]);
  });

  it('splits a repeating budget from the effective month forward and moves future overrides', async () => {
    prisma.categoryBudget.findFirst
      .mockResolvedValueOnce(createBudget())
      .mockResolvedValueOnce(null);
    prisma.categoryBudget.create.mockResolvedValue(
      createBudget({
        id: 'budget-2',
        amount: new Prisma.Decimal('130'),
        startMonth: new Date('2026-06-01T00:00:00.000Z'),
      }),
    );

    const updated = await service.update(OWNER_ID, 'budget-1', {
      amount: 130,
      effectiveMonth: '2026-06',
      endMonth: null,
    });

    expect(prisma.categoryBudget.update).toHaveBeenCalledWith({
      where: { id: 'budget-1' },
      data: {
        endMonth: new Date('2026-04-30T22:00:00.000Z'),
      },
    });
    expect(prisma.categoryBudgetOverride.updateMany).toHaveBeenCalledWith({
      where: {
        categoryBudgetId: 'budget-1',
        month: {
          gte: new Date('2026-05-31T22:00:00.000Z'),
        },
      },
      data: {
        categoryBudgetId: 'budget-2',
        userId: OWNER_ID,
      },
    });
    expect(updated.id).toBe('budget-2');
    expect(updated.startMonth).toBe('2026-06');
  });

  it('ends budget coverage from the effective month forward without mutating past months', async () => {
    prisma.categoryBudget.findFirst.mockResolvedValue(createBudget());

    await service.remove(OWNER_ID, 'budget-1', '2026-06');

    expect(prisma.categoryBudget.update).toHaveBeenCalledWith({
      where: { id: 'budget-1' },
      data: {
        endMonth: new Date('2026-04-30T22:00:00.000Z'),
      },
    });
    expect(prisma.categoryBudgetOverride.deleteMany).toHaveBeenCalledWith({
      where: {
        categoryBudgetId: 'budget-1',
        month: {
          gte: new Date('2026-05-31T22:00:00.000Z'),
        },
      },
    });
  });
});
