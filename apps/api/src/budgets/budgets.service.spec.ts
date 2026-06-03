import { NotFoundException } from '@nestjs/common';
import {
  CategoryType,
  Prisma,
  TransactionDirection,
  TransactionKind,
} from '@finhance/db';
import { BudgetsService } from '@budgets/budgets.service';

const OWNER_ID = 'local-dev';
const NOW = new Date('2026-04-23T10:00:00.000Z');

function createPrimaryCategory(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'category-primary',
    userId: OWNER_ID,
    name: 'Household',
    type: CategoryType.EXPENSE,
    parentCategoryId: null,
    parentCategory: null,
    order: 0,
    archivedAt: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function createSecondaryCategory(
  overrides: Partial<Record<string, unknown>> = {},
) {
  const parentCategory =
    (overrides.parentCategory as ReturnType<typeof createPrimaryCategory>) ??
    createPrimaryCategory();

  return {
    id: 'category-1',
    userId: OWNER_ID,
    name: 'Groceries',
    type: CategoryType.EXPENSE,
    parentCategoryId: parentCategory.id,
    parentCategory,
    order: 0,
    archivedAt: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function createBudget(overrides: Partial<Record<string, unknown>> = {}) {
  const category =
    (overrides.category as
      | ReturnType<typeof createPrimaryCategory>
      | ReturnType<typeof createSecondaryCategory>) ??
    createSecondaryCategory();

  return {
    id: 'budget-1',
    userId: OWNER_ID,
    categoryId:
      (overrides.categoryId as string | undefined) ?? (category.id as string),
    currency: 'EUR',
    amount: new Prisma.Decimal('100'),
    startMonth: new Date('2026-04-01T00:00:00.000Z'),
    endMonth: null,
    createdAt: NOW,
    updatedAt: NOW,
    category,
    overrides: [],
    ...overrides,
  };
}

function createOverride(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'override-1',
    userId: OWNER_ID,
    categoryBudgetId: 'budget-1',
    month: new Date('2026-04-01T00:00:00.000Z'),
    amount: new Prisma.Decimal('90'),
    note: 'Carryover',
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function createExpenseRow(overrides: Partial<Record<string, unknown>> = {}) {
  const category =
    overrides.category === null
      ? null
      : ((overrides.category as ReturnType<typeof createSecondaryCategory>) ??
        createSecondaryCategory());
  const categoryId =
    overrides.categoryId !== undefined
      ? (overrides.categoryId as string | null)
      : category?.id ?? null;

  return {
    id: 'transaction-1',
    userId: OWNER_ID,
    postedAt: new Date('2026-04-10T10:00:00.000Z'),
    accountId: 'account-1',
    categoryId,
    amount: new Prisma.Decimal('120'),
    currency: 'EUR',
    direction: TransactionDirection.OUTFLOW,
    kind: TransactionKind.EXPENSE,
    description: 'Groceries',
    notes: null,
    counterparty: null,
    transferGroupId: null,
    createdAt: NOW,
    updatedAt: NOW,
    recurringRuleId: null,
    recurringOccurrenceMonth: null,
    account: null,
    category,
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
    category: {
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
      category: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };

    prisma.$transaction.mockImplementation(
      async (
        callback: (tx: {
          categoryBudget: typeof prisma.categoryBudget;
          categoryBudgetOverride: typeof prisma.categoryBudgetOverride;
          category: typeof prisma.category;
        }) => Promise<unknown>,
      ) =>
        callback({
          categoryBudget: prisma.categoryBudget,
          categoryBudgetOverride: prisma.categoryBudgetOverride,
          category: prisma.category,
        }),
    );

    categories = {
      findOne: jest.fn().mockResolvedValue(createSecondaryCategory()),
    };

    service = new BudgetsService(prisma as never, categories as never);
  });

  it('rejects invalid categories for budgets', async () => {
    categories.findOne.mockRejectedValue(
      new NotFoundException('Category category-1 was not found.'),
    );

    await expect(
      service.create(OWNER_ID, {
        categoryId: 'category-1',
        currency: 'EUR',
        amount: 100,
        startMonth: '2026-04',
      }),
    ).rejects.toThrow('Category category-1 is invalid.');
  });

  it('rejects non-expense categories for budgets', async () => {
    categories.findOne.mockResolvedValue(
      createPrimaryCategory({
        id: 'category-income',
        name: 'Salary',
        type: CategoryType.INCOME,
      }),
    );

    await expect(
      service.create(OWNER_ID, {
        categoryId: 'category-income',
        currency: 'EUR',
        amount: 100,
        startMonth: '2026-04',
      }),
    ).rejects.toThrow('Budgets can only be assigned to expense categories.');
  });

  it('rejects overlapping repeating budgets on the same category', async () => {
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

  it('allows overlapping primary and secondary budgets in the same range', async () => {
    categories.findOne.mockResolvedValue(createPrimaryCategory());
    prisma.categoryBudget.findFirst.mockResolvedValue(null);
    prisma.categoryBudget.create.mockResolvedValue(
      createBudget({
        category: createPrimaryCategory(),
        categoryId: 'category-primary',
        amount: new Prisma.Decimal('150'),
      }),
    );

    const created = await service.create(OWNER_ID, {
      categoryId: 'category-primary',
      currency: 'EUR',
      amount: 150,
      startMonth: '2026-04',
    });

    expect(created.categoryId).toBe('category-primary');
    expect(prisma.categoryBudget.findFirst).toHaveBeenCalledWith({
      where: expect.objectContaining({
        userId: OWNER_ID,
        categoryId: 'category-primary',
        currency: 'EUR',
      }),
    });
  });

  it('builds monthly budgets with overrides, unbudgeted expense, and uncategorized expense kept separate', async () => {
    prisma.categoryBudget.findMany.mockResolvedValue([
      createBudget({
        overrides: [createOverride()],
      }),
    ]);
    prisma.transaction.findMany.mockResolvedValue([
      createExpenseRow({
        amount: new Prisma.Decimal('120'),
      }),
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
        category: createSecondaryCategory({
          id: 'category-2',
          name: 'Dining',
          order: 1,
        }),
        amount: new Prisma.Decimal('30'),
      }),
      createExpenseRow({
        id: 'uncategorized',
        categoryId: null,
        category: null,
        amount: new Prisma.Decimal('10'),
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
            primaryCategoryId: 'category-primary',
            primaryCategoryName: 'Household',
            secondaryCategoryId: 'category-1',
            secondaryCategoryName: 'Groceries',
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
            primaryCategoryId: 'category-primary',
            primaryCategoryName: 'Household',
            secondaryCategoryId: 'category-2',
            secondaryCategoryName: 'Dining',
          },
        ],
      },
    ]);
  });

  it('keeps primary and secondary budget items while using the primary as the summary owner', async () => {
    prisma.categoryBudget.findMany.mockResolvedValue([
      createBudget({
        id: 'budget-primary',
        category: createPrimaryCategory(),
        categoryId: 'category-primary',
        amount: new Prisma.Decimal('150'),
      }),
      createBudget({
        id: 'budget-secondary',
        amount: new Prisma.Decimal('100'),
      }),
    ]);
    prisma.category.findMany.mockResolvedValue([
      { id: 'category-1', parentCategoryId: 'category-primary' },
      { id: 'category-2', parentCategoryId: 'category-primary' },
    ]);
    prisma.transaction.findMany.mockResolvedValue([
      createExpenseRow({
        category: createSecondaryCategory({
          id: 'category-1',
          name: 'Groceries',
        }),
        amount: new Prisma.Decimal('80'),
      }),
      createExpenseRow({
        id: 'transaction-2',
        category: createSecondaryCategory({
          id: 'category-2',
          name: 'Dining',
          order: 1,
        }),
        amount: new Prisma.Decimal('48'),
      }),
      createExpenseRow({
        id: 'prev-month-groceries',
        postedAt: new Date('2026-03-11T10:00:00.000Z'),
        category: createSecondaryCategory({
          id: 'category-1',
          name: 'Groceries',
        }),
        amount: new Prisma.Decimal('60'),
      }),
      createExpenseRow({
        id: 'two-months-back-dining',
        postedAt: new Date('2026-02-12T10:00:00.000Z'),
        category: createSecondaryCategory({
          id: 'category-2',
          name: 'Dining',
          order: 1,
        }),
        amount: new Prisma.Decimal('30'),
      }),
    ]);

    const result = await service.findMonthly(OWNER_ID, '2026-04', {
      includeArchivedCategories: true,
    });

    expect(result.currencies).toEqual([
      expect.objectContaining({
        currency: 'EUR',
        budgetTotal: 150,
        spentTotal: 128,
        remainingTotal: 22,
        overBudgetTotal: 0,
        overBudgetCount: 0,
        budgetedCategoryCount: 2,
        unbudgetedExpenseTotal: 0,
        uncategorizedExpenseTotal: 0,
        overBudgetHighlights: [],
        unbudgetedCategories: [],
      }),
    ]);
    expect(result.currencies[0].items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          budgetId: 'budget-primary',
          categoryId: 'category-primary',
          budgetAmount: 150,
          spentAmount: 128,
          secondaryCategoryId: null,
        }),
        expect.objectContaining({
          budgetId: 'budget-secondary',
          categoryId: 'category-1',
          budgetAmount: 100,
          spentAmount: 80,
          secondaryCategoryId: 'category-1',
        }),
      ]),
    );
  });

  it('deduplicates over-budget summary warnings to the primary roll-up owner', async () => {
    prisma.categoryBudget.findMany.mockResolvedValue([
      createBudget({
        id: 'budget-primary',
        category: createPrimaryCategory(),
        categoryId: 'category-primary',
        amount: new Prisma.Decimal('100'),
      }),
      createBudget({
        id: 'budget-secondary',
        amount: new Prisma.Decimal('70'),
      }),
    ]);
    prisma.category.findMany.mockResolvedValue([
      { id: 'category-1', parentCategoryId: 'category-primary' },
      { id: 'category-2', parentCategoryId: 'category-primary' },
    ]);
    prisma.transaction.findMany.mockResolvedValue([
      createExpenseRow({
        category: createSecondaryCategory({
          id: 'category-1',
          name: 'Groceries',
        }),
        amount: new Prisma.Decimal('80'),
      }),
      createExpenseRow({
        id: 'transaction-2',
        category: createSecondaryCategory({
          id: 'category-2',
          name: 'Dining',
          order: 1,
        }),
        amount: new Prisma.Decimal('60'),
      }),
    ]);

    const result = await service.findMonthly(OWNER_ID, '2026-04', {
      includeArchivedCategories: true,
    });

    expect(result.currencies[0]).toMatchObject({
      budgetTotal: 100,
      spentTotal: 140,
      remainingTotal: -40,
      overBudgetTotal: 40,
      overBudgetCount: 1,
      budgetedCategoryCount: 2,
    });
    expect(result.currencies[0].overBudgetHighlights).toEqual([
      expect.objectContaining({
        budgetId: 'budget-primary',
        categoryId: 'category-primary',
        spentAmount: 140,
        budgetAmount: 100,
        status: 'OVER_BUDGET',
      }),
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
        endMonth: new Date('2026-05-01T00:00:00.000Z'),
      },
    });
    expect(prisma.categoryBudgetOverride.updateMany).toHaveBeenCalledWith({
      where: {
        userId: OWNER_ID,
        categoryBudgetId: 'budget-1',
        month: {
          gte: new Date('2026-06-01T00:00:00.000Z'),
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
        endMonth: new Date('2026-05-01T00:00:00.000Z'),
      },
    });
    expect(prisma.categoryBudgetOverride.deleteMany).toHaveBeenCalledWith({
      where: {
        userId: OWNER_ID,
        categoryBudgetId: 'budget-1',
        month: {
          gte: new Date('2026-06-01T00:00:00.000Z'),
        },
      },
    });
  });
});
