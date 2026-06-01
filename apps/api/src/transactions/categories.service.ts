import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '@prisma/prisma.service';
import {
  Category,
  CategoryType,
  Prisma,
  TransactionKind,
} from '@prisma/client';
import { CreateCategoryDto } from '@transactions/dto/create-category.dto';
import { UpdateCategoryDto } from '@transactions/dto/update-category.dto';

interface PreparedCategoryInput {
  userId: string;
  name: string;
  type: CategoryType;
  order: number | null;
}

export interface CategoryDeletionState {
  canDeletePermanently: boolean;
  deleteBlockReason: string | null;
}

type CategoryTransactionClient = Prisma.TransactionClient;

@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(
    ownerId: string,
    options?: { includeArchived?: boolean },
  ): Promise<Category[]> {
    const includeArchived = options?.includeArchived ?? false;
    const categories = await this.prisma.category.findMany({
      where: {
        userId: ownerId,
        ...(includeArchived ? {} : { archivedAt: null }),
      },
      orderBy: [{ type: 'asc' }, { order: 'asc' }, { createdAt: 'asc' }],
    });

    if (!includeArchived) {
      return categories;
    }

    return categories.sort((left, right) => {
      if (left.type !== right.type) {
        return left.type.localeCompare(right.type);
      }

      if (left.archivedAt && !right.archivedAt) {
        return 1;
      }

      if (!left.archivedAt && right.archivedAt) {
        return -1;
      }

      if (left.order !== right.order) {
        return left.order - right.order;
      }

      return left.createdAt.getTime() - right.createdAt.getTime();
    });
  }

  async findOne(ownerId: string, id: string): Promise<Category> {
    const category = await this.prisma.category.findFirst({
      where: { id, userId: ownerId },
    });

    if (!category) {
      throw new NotFoundException(`Category ${id} was not found.`);
    }

    return category;
  }

  async create(ownerId: string, dto: CreateCategoryDto): Promise<Category> {
    const prepared = this.prepareCategoryInput(ownerId, dto);

    return this.prisma.$transaction(async (tx) => {
      await this.assertActiveNameAvailable(
        tx,
        ownerId,
        prepared.type,
        prepared.name,
      );

      const activeCategories = await this.findActiveOrderedCategories(
        tx,
        ownerId,
        prepared.type,
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
  ): Promise<Category> {
    const prepared = this.prepareCategoryInput(ownerId, dto);

    return this.prisma.$transaction(async (tx) => {
      const existing = await this.getRequiredCategory(tx, ownerId, id);

      if (!existing.archivedAt) {
        await this.assertActiveNameAvailable(
          tx,
          ownerId,
          prepared.type,
          prepared.name,
          id,
        );
      }

      if (existing.archivedAt) {
        await tx.category.update({
          where: { id },
          data: {
            name: prepared.name,
            type: prepared.type,
            order:
              prepared.order === null
                ? existing.order
                : Math.max(0, Math.trunc(prepared.order)),
          },
        });

        return this.getRequiredCategory(tx, ownerId, id);
      }

      if (existing.type === prepared.type) {
        await tx.category.update({
          where: { id },
          data: {
            name: prepared.name,
            type: prepared.type,
          },
        });

        const activeCategories = await this.findActiveOrderedCategories(
          tx,
          ownerId,
          prepared.type,
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
      );
      const newActiveCategories = await this.findActiveOrderedCategories(
        tx,
        ownerId,
        prepared.type,
      );

      await tx.category.update({
        where: { id },
        data: {
          name: prepared.name,
          type: prepared.type,
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

      const activeCategories = await this.findActiveOrderedCategories(
        tx,
        ownerId,
        existing.type,
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

  async unarchive(ownerId: string, id: string): Promise<Category> {
    return this.prisma.$transaction(async (tx) => {
      const existing = await this.getRequiredCategory(tx, ownerId, id);

      if (!existing.archivedAt) {
        return existing;
      }

      const activeCategories = await this.findActiveOrderedCategories(
        tx,
        ownerId,
        existing.type,
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
    client: PrismaService | Prisma.TransactionClient = this.prisma,
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

    const [transactions, recurringRules, budgets] = await Promise.all([
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
    ]);

    const dependencyCounts = new Map<
      string,
      { transactions: number; recurringRules: number; budgets: number }
    >(
      uniqueIds.map((id) => [
        id,
        { transactions: 0, recurringRules: 0, budgets: 0 },
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

    return new Map(
      uniqueIds.map((id) => {
        const counts = dependencyCounts.get(id)!;
        const parts = [
          this.formatDeleteDependency(counts.transactions, 'transaction'),
          this.formatDeleteDependency(counts.recurringRules, 'recurring rule'),
          this.formatDeleteDependency(counts.budgets, 'budget'),
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
  ): Promise<Category> {
    if (
      transactionKind !== TransactionKind.EXPENSE &&
      transactionKind !== TransactionKind.INCOME
    ) {
      throw new BadRequestException(
        'Only income and expense transactions may use categories.',
      );
    }

    let category: Category;

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

    return category;
  }

  private prepareCategoryInput(
    ownerId: string,
    dto: CreateCategoryDto | UpdateCategoryDto,
  ): PreparedCategoryInput {
    return {
      userId: ownerId,
      name: dto.name.trim(),
      type: dto.type,
      order: dto.order ?? null,
    };
  }

  private async assertActiveNameAvailable(
    tx: CategoryTransactionClient,
    ownerId: string,
    type: CategoryType,
    name: string,
    excludeId?: string,
  ): Promise<void> {
    const duplicate = await tx.category.findFirst({
      where: {
        userId: ownerId,
        type,
        archivedAt: null,
        name: {
          equals: name,
          mode: 'insensitive',
        },
      },
    });

    if (duplicate && duplicate.id !== excludeId) {
      throw new ConflictException(
        `An active ${type.toLowerCase()} category named ${name} already exists.`,
      );
    }
  }

  private async findActiveOrderedCategories(
    tx: CategoryTransactionClient,
    ownerId: string,
    type: CategoryType,
  ): Promise<Category[]> {
    return tx.category.findMany({
      where: {
        userId: ownerId,
        type,
        archivedAt: null,
      },
      orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
    });
  }

  private async applyActiveOrder(
    tx: CategoryTransactionClient,
    categories: Category[],
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
    tx: CategoryTransactionClient,
    ownerId: string,
    id: string,
  ): Promise<Category> {
    const category = await tx.category.findFirst({
      where: { id, userId: ownerId },
    });

    if (!category) {
      throw new NotFoundException(`Category ${id} was not found.`);
    }

    return category;
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
