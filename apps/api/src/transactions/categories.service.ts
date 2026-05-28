import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '@prisma/prisma.service';
import { CategoryType, Prisma, TransactionKind } from '@finhance/db';
import { CreateCategoryDto } from '@transactions/dto/create-category.dto';
import { UpdateCategoryDto } from '@transactions/dto/update-category.dto';
import type { HierarchicalCategoryRecord } from '@transactions/category-hierarchy';

interface PreparedCategoryInput {
  userId: string;
  name: string;
  type: CategoryType;
  parentCategoryId: string | null;
  order: number | null;
}

export interface CategoryDeletionState {
  canDeletePermanently: boolean;
  deleteBlockReason: string | null;
}

type CategoryTransactionClient = Prisma.TransactionClient;
type CategoryReadClient = PrismaService | Prisma.TransactionClient;

@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(
    ownerId: string,
    options?: { includeArchived?: boolean },
  ): Promise<HierarchicalCategoryRecord[]> {
    const includeArchived = options?.includeArchived ?? false;
    const categories = await this.prisma.category.findMany({
      where: {
        userId: ownerId,
        ...(includeArchived ? {} : { archivedAt: null }),
      },
      include: {
        parentCategory: true,
      },
    });

    return categories.sort((left, right) =>
      this.compareCategoriesForDisplay(left, right, includeArchived),
    );
  }

  async findOne(
    ownerId: string,
    id: string,
  ): Promise<HierarchicalCategoryRecord> {
    const category = await this.prisma.category.findFirst({
      where: { id, userId: ownerId },
      include: {
        parentCategory: true,
      },
    });

    if (!category) {
      throw new NotFoundException(`Category ${id} was not found.`);
    }

    return category;
  }

  async findManyByIds(
    ownerId: string,
    ids: string[],
  ): Promise<HierarchicalCategoryRecord[]> {
    const uniqueIds = [...new Set(ids.filter((id) => id.trim().length > 0))];
    if (uniqueIds.length === 0) {
      return [];
    }

    const categories = await this.prisma.category.findMany({
      where: {
        userId: ownerId,
        id: { in: uniqueIds },
      },
      include: {
        parentCategory: true,
      },
    });

    return categories.sort((left, right) =>
      this.compareCategoriesForDisplay(left, right, true),
    );
  }

  async create(
    ownerId: string,
    dto: CreateCategoryDto,
  ): Promise<HierarchicalCategoryRecord> {
    const prepared = await this.prepareCategoryInput(ownerId, dto);

    return this.prisma.$transaction(async (tx) => {
      await this.assertActiveNameAvailable(
        tx,
        ownerId,
        prepared.type,
        prepared.name,
        prepared.parentCategoryId,
      );

      const activeCategories = await this.findActiveOrderedCategories(
        tx,
        ownerId,
        prepared.type,
        prepared.parentCategoryId,
      );
      const targetOrder = this.clampOrder(
        prepared.order,
        activeCategories.length,
      );
      const category = await tx.category.create({
        data: {
          userId: prepared.userId,
          name: prepared.name,
          type: prepared.type,
          parentCategoryId: prepared.parentCategoryId,
          order: activeCategories.length,
        },
      });

      const reorderedIds = activeCategories.map(
        (activeCategory) => activeCategory.id,
      );
      reorderedIds.splice(targetOrder, 0, category.id);
      await this.applyActiveOrder(
        tx,
        [...activeCategories, category],
        reorderedIds,
      );

      return this.getRequiredCategory(tx, ownerId, category.id);
    });
  }

  async update(
    ownerId: string,
    id: string,
    dto: UpdateCategoryDto,
  ): Promise<HierarchicalCategoryRecord> {
    const prepared = await this.prepareCategoryInput(ownerId, dto, id);

    return this.prisma.$transaction(async (tx) => {
      const existing = await this.getRequiredCategory(tx, ownerId, id);

      await this.assertHierarchyChangeAllowed(tx, ownerId, existing, prepared);

      if (!existing.archivedAt) {
        await this.assertActiveNameAvailable(
          tx,
          ownerId,
          prepared.type,
          prepared.name,
          prepared.parentCategoryId,
          id,
        );
      }

      if (existing.archivedAt) {
        await tx.category.update({
          where: { id },
          data: {
            name: prepared.name,
            type: prepared.type,
            parentCategoryId: prepared.parentCategoryId,
            order:
              prepared.order === null
                ? existing.order
                : Math.max(0, Math.trunc(prepared.order)),
          },
        });

        return this.getRequiredCategory(tx, ownerId, id);
      }

      const sameSiblingGroup =
        existing.type === prepared.type &&
        existing.parentCategoryId === prepared.parentCategoryId;

      if (sameSiblingGroup) {
        await tx.category.update({
          where: { id },
          data: {
            name: prepared.name,
            type: prepared.type,
            parentCategoryId: prepared.parentCategoryId,
          },
        });

        const activeCategories = await this.findActiveOrderedCategories(
          tx,
          ownerId,
          prepared.type,
          prepared.parentCategoryId,
        );
        const reorderedIds = activeCategories
          .map((activeCategory) => activeCategory.id)
          .filter((categoryId) => categoryId !== id);
        const currentIndex = activeCategories.findIndex(
          (activeCategory) => activeCategory.id === id,
        );
        const targetOrder = this.clampOrder(
          prepared.order ?? currentIndex,
          reorderedIds.length,
        );

        reorderedIds.splice(targetOrder, 0, id);
        await this.applyActiveOrder(tx, activeCategories, reorderedIds);

        return this.getRequiredCategory(tx, ownerId, id);
      }

      const oldActiveCategories = await this.findActiveOrderedCategories(
        tx,
        ownerId,
        existing.type,
        existing.parentCategoryId,
      );
      const newActiveCategories = await this.findActiveOrderedCategories(
        tx,
        ownerId,
        prepared.type,
        prepared.parentCategoryId,
      );

      await tx.category.update({
        where: { id },
        data: {
          name: prepared.name,
          type: prepared.type,
          parentCategoryId: prepared.parentCategoryId,
          order: newActiveCategories.length,
        },
      });

      const oldReorderedIds = oldActiveCategories
        .map((activeCategory) => activeCategory.id)
        .filter((categoryId) => categoryId !== id);
      await this.applyActiveOrder(tx, oldActiveCategories, oldReorderedIds);

      const targetOrder = this.clampOrder(
        prepared.order,
        newActiveCategories.length,
      );
      const newReorderedIds = newActiveCategories.map(
        (activeCategory) => activeCategory.id,
      );
      newReorderedIds.splice(targetOrder, 0, id);
      const category = await this.getRequiredCategory(tx, ownerId, id);
      await this.applyActiveOrder(
        tx,
        [...newActiveCategories, category],
        newReorderedIds,
      );

      return this.getRequiredCategory(tx, ownerId, id);
    });
  }

  async remove(ownerId: string, id: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const existing = await this.getRequiredCategory(tx, ownerId, id);

      if (existing.archivedAt) {
        return;
      }

      await this.assertCategoryHasNoChildren(tx, ownerId, existing.id, {
        forAction: 'archive',
      });

      const activeCategories = await this.findActiveOrderedCategories(
        tx,
        ownerId,
        existing.type,
        existing.parentCategoryId,
      );
      const reorderedIds = activeCategories
        .map((activeCategory) => activeCategory.id)
        .filter((categoryId) => categoryId !== id);

      await tx.category.update({
        where: { id },
        data: { archivedAt: new Date() },
      });
      await this.applyActiveOrder(tx, activeCategories, reorderedIds);
    });
  }

  async unarchive(
    ownerId: string,
    id: string,
  ): Promise<HierarchicalCategoryRecord> {
    return this.prisma.$transaction(async (tx) => {
      const existing = await this.getRequiredCategory(tx, ownerId, id);

      if (!existing.archivedAt) {
        return existing;
      }

      if (existing.parentCategoryId) {
        const parentCategory = await this.getRequiredCategory(
          tx,
          ownerId,
          existing.parentCategoryId,
        );

        if (parentCategory.archivedAt) {
          throw new ConflictException(
            'Unarchive the primary category before unarchiving this secondary category.',
          );
        }
      }

      const activeCategories = await this.findActiveOrderedCategories(
        tx,
        ownerId,
        existing.type,
        existing.parentCategoryId,
      );

      await tx.category.update({
        where: { id },
        data: {
          archivedAt: null,
          order: activeCategories.length,
        },
      });

      return this.getRequiredCategory(tx, ownerId, id);
    });
  }

  async permanentlyDelete(ownerId: string, id: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const existing = await this.getRequiredCategory(tx, ownerId, id);

      if (!existing.archivedAt) {
        throw new ConflictException(
          'Archive this category before deleting it permanently.',
        );
      }

      const deletionState = (
        await this.getDeletionStates(ownerId, [id], tx)
      ).get(id);

      if (!deletionState?.canDeletePermanently) {
        throw new ConflictException(
          deletionState?.deleteBlockReason ??
            'This category still has linked data and cannot be deleted permanently.',
        );
      }

      await tx.category.delete({
        where: { id },
      });
    });
  }

  async getDeletionStates(
    ownerId: string,
    categoryIds: string[],
    client: CategoryReadClient = this.prisma,
  ): Promise<Map<string, CategoryDeletionState>> {
    const uniqueIds = [...new Set(categoryIds)];

    if (uniqueIds.length === 0) {
      return new Map();
    }

    const recurringRuleClient =
      'recurringTransactionRule' in client
        ? client.recurringTransactionRule
        : null;
    const budgetClient =
      'categoryBudget' in client ? client.categoryBudget : null;
    const expenseValidationRuleClient =
      'expenseValidationRule' in client ? client.expenseValidationRule : null;

    const [transactions, recurringRules, budgets, childCategories, rules] =
      await Promise.all([
        client.transaction.findMany({
          where: {
            userId: ownerId,
            categoryId: { in: uniqueIds },
          },
          select: { categoryId: true },
        }),
        recurringRuleClient
          ? recurringRuleClient.findMany({
              where: {
                userId: ownerId,
                categoryId: { in: uniqueIds },
              },
              select: { categoryId: true },
            })
          : Promise.resolve([]),
        budgetClient
          ? budgetClient.findMany({
              where: {
                userId: ownerId,
                categoryId: { in: uniqueIds },
              },
              select: { categoryId: true },
            })
          : Promise.resolve([]),
        client.category.findMany({
          where: {
            userId: ownerId,
            parentCategoryId: { in: uniqueIds },
          },
          select: { parentCategoryId: true },
        }),
        expenseValidationRuleClient
          ? expenseValidationRuleClient.findMany({
              where: {
                userId: ownerId,
                secondaryCategoryId: { in: uniqueIds },
              },
              select: { secondaryCategoryId: true },
            })
          : Promise.resolve([]),
      ]);

    const dependencyCounts = new Map<
      string,
      {
        transactions: number;
        recurringRules: number;
        budgets: number;
        childCategories: number;
        expenseValidationRules: number;
      }
    >(
      uniqueIds.map((id) => [
        id,
        {
          transactions: 0,
          recurringRules: 0,
          budgets: 0,
          childCategories: 0,
          expenseValidationRules: 0,
        },
      ]),
    );

    for (const transaction of transactions) {
      if (!transaction.categoryId) {
        continue;
      }

      dependencyCounts.get(transaction.categoryId)!.transactions += 1;
    }

    for (const recurringRule of recurringRules) {
      if (!recurringRule.categoryId) {
        continue;
      }

      dependencyCounts.get(recurringRule.categoryId)!.recurringRules += 1;
    }

    for (const budget of budgets) {
      dependencyCounts.get(budget.categoryId)!.budgets += 1;
    }

    for (const childCategory of childCategories) {
      if (!childCategory.parentCategoryId) {
        continue;
      }

      dependencyCounts.get(childCategory.parentCategoryId)!.childCategories +=
        1;
    }

    for (const rule of rules) {
      dependencyCounts.get(rule.secondaryCategoryId)!.expenseValidationRules +=
        1;
    }

    return new Map(
      uniqueIds.map((id) => {
        const counts = dependencyCounts.get(id)!;
        const parts = [
          this.formatDeleteDependency(
            counts.childCategories,
            'secondary category',
          ),
          this.formatDeleteDependency(counts.transactions, 'transaction'),
          this.formatDeleteDependency(counts.recurringRules, 'recurring rule'),
          this.formatDeleteDependency(counts.budgets, 'budget'),
          this.formatDeleteDependency(
            counts.expenseValidationRules,
            'expense validation rule',
          ),
        ].filter((value): value is string => value !== null);

        return [
          id,
          {
            canDeletePermanently: parts.length === 0,
            deleteBlockReason:
              parts.length === 0
                ? null
                : `This category still has linked ${parts.join(', ')}.`,
          },
        ] satisfies [string, CategoryDeletionState];
      }),
    );
  }

  async getAssignableCategory(
    ownerId: string,
    categoryId: string,
    transactionKind: TransactionKind,
    currentCategoryId?: string | null,
  ): Promise<HierarchicalCategoryRecord> {
    if (
      transactionKind !== TransactionKind.EXPENSE &&
      transactionKind !== TransactionKind.INCOME
    ) {
      throw new BadRequestException(
        'Only income and expense transactions may use categories.',
      );
    }

    let category: HierarchicalCategoryRecord;

    try {
      category = await this.findOne(ownerId, categoryId);
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw new BadRequestException(`Category ${categoryId} is invalid.`);
      }

      throw error;
    }

    if (category.archivedAt && category.id !== currentCategoryId) {
      throw new BadRequestException(
        'Archived categories cannot be newly assigned to transactions.',
      );
    }

    const expectedType =
      transactionKind === TransactionKind.EXPENSE
        ? CategoryType.EXPENSE
        : CategoryType.INCOME;

    if (category.type !== expectedType) {
      throw new BadRequestException(
        `Category ${category.id} does not match ${transactionKind.toLowerCase()} transactions.`,
      );
    }

    if (
      transactionKind === TransactionKind.EXPENSE &&
      !category.parentCategoryId
    ) {
      throw new BadRequestException(
        'Expense transactions must use secondary categories.',
      );
    }

    if (
      transactionKind === TransactionKind.INCOME &&
      category.parentCategoryId
    ) {
      throw new BadRequestException(
        'Income transactions cannot use secondary categories.',
      );
    }

    if (
      category.parentCategoryId &&
      category.parentCategory?.archivedAt &&
      category.id !== currentCategoryId
    ) {
      throw new BadRequestException(
        'Secondary categories with archived primaries cannot be newly assigned.',
      );
    }

    return category;
  }

  async findMatchingExpenseSecondaryCategory(
    ownerId: string,
    normalizedEntry: string,
  ): Promise<HierarchicalCategoryRecord | null> {
    if (!normalizedEntry) {
      return null;
    }

    const rule = await this.prisma.expenseValidationRule.findFirst({
      where: {
        userId: ownerId,
        normalizedEntry,
        secondaryCategory: {
          archivedAt: null,
          parentCategoryId: { not: null },
          parentCategory: {
            archivedAt: null,
          },
        },
      },
      include: {
        secondaryCategory: {
          include: {
            parentCategory: true,
          },
        },
      },
    });

    return rule?.secondaryCategory ?? null;
  }

  private async prepareCategoryInput(
    ownerId: string,
    dto: CreateCategoryDto | UpdateCategoryDto,
    categoryId?: string,
  ): Promise<PreparedCategoryInput> {
    const parentCategoryId = dto.parentCategoryId?.trim() || null;

    if (categoryId && parentCategoryId === categoryId) {
      throw new BadRequestException(
        'A category cannot be its own primary category.',
      );
    }

    let resolvedParentCategoryId: string | null = null;

    if (dto.type === CategoryType.INCOME) {
      if (parentCategoryId) {
        throw new BadRequestException(
          'Income categories cannot have primary categories.',
        );
      }
    } else if (parentCategoryId) {
      const parentCategory = await this.findOne(ownerId, parentCategoryId);

      if (parentCategory.type !== CategoryType.EXPENSE) {
        throw new BadRequestException(
          'Expense secondary categories must belong to expense primaries.',
        );
      }

      if (parentCategory.parentCategoryId) {
        throw new BadRequestException(
          'Secondary categories cannot have their own secondary categories.',
        );
      }

      if (parentCategory.archivedAt) {
        throw new BadRequestException(
          'Archived primary categories cannot receive secondary categories.',
        );
      }

      resolvedParentCategoryId = parentCategory.id;
    }

    return {
      userId: ownerId,
      name: dto.name.trim(),
      type: dto.type,
      parentCategoryId: resolvedParentCategoryId,
      order: dto.order ?? null,
    };
  }

  private async assertActiveNameAvailable(
    tx: CategoryTransactionClient,
    ownerId: string,
    type: CategoryType,
    name: string,
    parentCategoryId: string | null,
    excludeId?: string,
  ): Promise<void> {
    const duplicate = await tx.category.findFirst({
      where: {
        userId: ownerId,
        type,
        parentCategoryId,
        archivedAt: null,
        name: {
          equals: name,
          mode: 'insensitive',
        },
      },
    });

    if (duplicate && duplicate.id !== excludeId) {
      throw new ConflictException(
        `An active ${type.toLowerCase()} category named ${name} already exists in this group.`,
      );
    }
  }

  private async findActiveOrderedCategories(
    tx: CategoryTransactionClient,
    ownerId: string,
    type: CategoryType,
    parentCategoryId: string | null,
  ) {
    return tx.category.findMany({
      where: {
        userId: ownerId,
        type,
        parentCategoryId,
        archivedAt: null,
      },
      orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
    });
  }

  private async assertHierarchyChangeAllowed(
    tx: CategoryTransactionClient,
    ownerId: string,
    existing: HierarchicalCategoryRecord,
    next: PreparedCategoryInput,
  ): Promise<void> {
    const currentlyPrimaryExpense =
      existing.type === CategoryType.EXPENSE &&
      existing.parentCategoryId === null;
    const remainsPrimaryExpense =
      next.type === CategoryType.EXPENSE && next.parentCategoryId === null;

    if (!currentlyPrimaryExpense || remainsPrimaryExpense) {
      return;
    }

    const childCount = await tx.category.count({
      where: {
        userId: ownerId,
        parentCategoryId: existing.id,
      },
    });

    if (childCount > 0) {
      throw new ConflictException(
        'Primary expense categories with secondary categories must keep their current role until those secondary categories are moved or removed.',
      );
    }
  }

  private async assertCategoryHasNoChildren(
    tx: CategoryTransactionClient,
    ownerId: string,
    categoryId: string,
    options: { forAction: 'archive' | 'delete' },
  ): Promise<void> {
    const childCount = await tx.category.count({
      where: {
        userId: ownerId,
        parentCategoryId: categoryId,
      },
    });

    if (childCount === 0) {
      return;
    }

    throw new ConflictException(
      options.forAction === 'archive'
        ? 'Primary expense categories with secondary categories cannot be archived until those secondary categories are moved or archived.'
        : 'Primary expense categories with secondary categories cannot be deleted until those secondary categories are removed.',
    );
  }

  private async applyActiveOrder(
    tx: CategoryTransactionClient,
    categories: Array<{ id: string; order: number }>,
    orderedIds: string[],
  ): Promise<void> {
    const categoriesById = new Map(
      categories.map((category) => [category.id, category]),
    );

    for (const [index, categoryId] of orderedIds.entries()) {
      const category = categoriesById.get(categoryId);

      if (!category || category.order === index) {
        continue;
      }

      await tx.category.update({
        where: { id: categoryId },
        data: { order: index },
      });
    }
  }

  private clampOrder(order: number | null, maxIndex: number): number {
    if (order === null || Number.isNaN(order)) {
      return maxIndex;
    }

    return Math.max(0, Math.min(Math.trunc(order), maxIndex));
  }

  private async getRequiredCategory(
    tx: CategoryReadClient,
    ownerId: string,
    id: string,
  ): Promise<HierarchicalCategoryRecord> {
    const category = await tx.category.findFirst({
      where: { id, userId: ownerId },
      include: {
        parentCategory: true,
      },
    });

    if (!category) {
      throw new NotFoundException(`Category ${id} was not found.`);
    }

    return category;
  }

  private compareCategoriesForDisplay(
    left: HierarchicalCategoryRecord,
    right: HierarchicalCategoryRecord,
    includeArchived: boolean,
  ): number {
    if (left.type !== right.type) {
      return left.type.localeCompare(right.type);
    }

    const leftGroupOrder = left.parentCategory?.order ?? left.order;
    const rightGroupOrder = right.parentCategory?.order ?? right.order;
    if (leftGroupOrder !== rightGroupOrder) {
      return leftGroupOrder - rightGroupOrder;
    }

    const leftGroupName = left.parentCategory?.name ?? left.name;
    const rightGroupName = right.parentCategory?.name ?? right.name;
    const groupNameCompare = leftGroupName.localeCompare(rightGroupName);
    if (groupNameCompare !== 0) {
      return groupNameCompare;
    }

    if (left.parentCategoryId === null && right.parentCategoryId !== null) {
      return -1;
    }

    if (left.parentCategoryId !== null && right.parentCategoryId === null) {
      return 1;
    }

    if (includeArchived) {
      if (left.archivedAt && !right.archivedAt) {
        return 1;
      }

      if (!left.archivedAt && right.archivedAt) {
        return -1;
      }
    }

    if (left.order !== right.order) {
      return left.order - right.order;
    }

    return left.createdAt.getTime() - right.createdAt.getTime();
  }

  private formatDeleteDependency(
    count: number,
    singular: string,
  ): string | null {
    if (count === 0) {
      return null;
    }

    return `${count} ${singular}${count === 1 ? '' : 's'}`;
  }
}
