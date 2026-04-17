import { CategoryType, TransactionKind } from '@prisma/client';
import { CategoriesService } from '@transactions/categories.service';

const OWNER_ID = 'local-dev';
type CategoryUpdateCall = {
  where: { id: string };
  data: {
    order?: number;
    archivedAt?: Date;
  };
};

function nthCallArg<T>(mockFn: jest.Mock, index: number): T {
  const calls = mockFn.mock.calls as unknown[][];
  return calls[index]?.[0] as T;
}

function createCategory(overrides: Partial<Record<string, unknown>> = {}) {
  const now = new Date('2026-04-17T10:00:00.000Z');

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

describe('CategoriesService', () => {
  let service: CategoriesService;
  let prisma: {
    category: {
      findMany: jest.Mock;
      findFirst: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
    $transaction: jest.Mock;
  };

  beforeEach(() => {
    prisma = {
      category: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      $transaction: jest.fn(),
    };

    prisma.$transaction.mockImplementation(
      async (
        callback: (tx: {
          category: typeof prisma.category;
        }) => Promise<unknown>,
      ) =>
        callback({
          category: prisma.category,
        }),
    );

    service = new CategoriesService(prisma as never);
  });

  it('creates categories at the requested order within their type', async () => {
    const existing = createCategory();
    const created = createCategory({
      id: 'category-2',
      name: 'Dining',
      order: 1,
    });
    const finalCreated = createCategory({
      id: 'category-2',
      name: 'Dining',
      order: 0,
    });

    prisma.category.findFirst.mockResolvedValueOnce(null);
    prisma.category.findMany.mockResolvedValue([existing]);
    prisma.category.create.mockResolvedValue(created);
    prisma.category.findFirst.mockResolvedValueOnce(finalCreated);

    const result = await service.create(OWNER_ID, {
      name: 'Dining',
      type: CategoryType.EXPENSE,
      order: 0,
    });

    expect(result.order).toBe(0);
    expect(prisma.category.update.mock.calls).toEqual([
      [{ where: { id: 'category-2' }, data: { order: 0 } }],
      [{ where: { id: 'category-1' }, data: { order: 1 } }],
    ]);
  });

  it('archives categories and compacts the remaining active order', async () => {
    const first = createCategory({ id: 'category-1', order: 0 });
    const second = createCategory({ id: 'category-2', order: 1 });

    prisma.category.findFirst.mockResolvedValue(first);
    prisma.category.findMany.mockResolvedValue([first, second]);
    prisma.category.update.mockResolvedValue(second);

    await service.remove(OWNER_ID, 'category-1');

    const firstUpdateCall = nthCallArg<CategoryUpdateCall | undefined>(
      prisma.category.update,
      0,
    );

    expect(firstUpdateCall).toMatchObject({
      where: { id: 'category-1' },
      data: {
        archivedAt: expect.any(Date) as Date,
      },
    });
    expect(prisma.category.update.mock.calls[1]).toEqual([
      { where: { id: 'category-2' }, data: { order: 0 } },
    ]);
  });

  it('rejects mismatched category types for transactions', async () => {
    prisma.category.findFirst.mockResolvedValue(
      createCategory({ type: CategoryType.EXPENSE }),
    );

    await expect(
      service.getAssignableCategory(
        OWNER_ID,
        'category-1',
        TransactionKind.INCOME,
      ),
    ).rejects.toThrow('does not match income transactions');
  });
});
