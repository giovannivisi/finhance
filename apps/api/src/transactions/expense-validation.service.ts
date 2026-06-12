import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@finhance/db';
import { parseCsvTable, serializeCsv } from '@/common/csv';
import { PrismaService } from '@prisma/prisma.service';
import { normalizeExpenseValidationEntry } from '@transactions/category-hierarchy';
import { CategoriesService } from '@transactions/categories.service';
import type { CreateExpenseValidationRuleDto } from '@transactions/dto/create-expense-validation-rule.dto';
import type { UpdateExpenseValidationRuleDto } from '@transactions/dto/update-expense-validation-rule.dto';

type ValidationClient = PrismaService | Prisma.TransactionClient;

export type ExpenseValidationRuleRecord =
  Prisma.ExpenseValidationRuleGetPayload<{
    include: {
      secondaryCategory: {
        include: {
          parentCategory: true;
        };
      };
    };
  }>;

interface ParsedHierarchyRow {
  rowNumber: number;
  level: 'PRIMARY' | 'SECONDARY';
  primary: string;
  secondary: string | null;
  primaryOrder: number | null;
  secondaryOrder: number | null;
}

interface ParsedRuleRow {
  rowNumber: number;
  entry: string;
  normalizedEntry: string;
  primary: string;
  secondary: string;
}

@Injectable()
export class ExpenseValidationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly categoriesService: CategoriesService,
  ) {}

  async list(ownerId: string): Promise<ExpenseValidationRuleRecord[]> {
    return this.prisma.expenseValidationRule.findMany({
      where: { userId: ownerId },
      include: {
        secondaryCategory: {
          include: {
            parentCategory: true,
          },
        },
      },
      orderBy: [{ normalizedEntry: 'asc' }, { createdAt: 'asc' }],
    });
  }

  async create(
    ownerId: string,
    dto: CreateExpenseValidationRuleDto,
  ): Promise<ExpenseValidationRuleRecord> {
    return this.prisma.$transaction(async (tx) => {
      return this.upsertRule(tx, ownerId, dto);
    });
  }

  async update(
    ownerId: string,
    id: string,
    dto: UpdateExpenseValidationRuleDto,
  ): Promise<ExpenseValidationRuleRecord> {
    return this.prisma.$transaction(async (tx) => {
      const existing = await this.requireRule(tx, ownerId, id);

      return this.upsertRule(
        tx,
        ownerId,
        {
          entry: dto.entry ?? existing.entry,
          secondaryCategoryId:
            dto.secondaryCategoryId ?? existing.secondaryCategoryId,
        },
        id,
      );
    });
  }

  async remove(ownerId: string, id: string): Promise<void> {
    await this.requireRule(this.prisma, ownerId, id);
    await this.prisma.expenseValidationRule.delete({
      where: { id },
    });
  }

  async exportRulesCsv(ownerId: string): Promise<string> {
    const rules = await this.list(ownerId);
    return serializeCsv({
      headers: ['entry', 'primary', 'secondary'],
      rows: rules.map((rule) => ({
        entry: rule.entry,
        primary: rule.secondaryCategory.parentCategory!.name,
        secondary: rule.secondaryCategory.name,
      })),
      quote: 'all',
    });
  }

  async exportHierarchyCsv(ownerId: string): Promise<string> {
    const categories = await this.categoriesService.findAll(ownerId, {
      includeArchived: true,
    });
    const activeExpenseCategories = categories.filter(
      (category) => category.type === 'EXPENSE' && category.archivedAt === null,
    );
    const primaries = activeExpenseCategories.filter(
      (category) => category.parentCategoryId === null,
    );
    const secondaries = activeExpenseCategories.filter(
      (category) => category.parentCategoryId !== null,
    );
    const secondaryGroups = new Map<string, typeof secondaries>();

    for (const secondary of secondaries) {
      const group = secondaryGroups.get(secondary.parentCategoryId!) ?? [];
      group.push(secondary);
      secondaryGroups.set(secondary.parentCategoryId!, group);
    }

    const rows: Array<Record<string, string>> = [];
    for (const primary of primaries) {
      const children = (secondaryGroups.get(primary.id) ?? []).sort(
        (left, right) =>
          left.order - right.order || left.name.localeCompare(right.name),
      );
      if (children.length === 0) {
        rows.push({
          level: 'PRIMARY',
          primary: primary.name,
          secondary: '',
          primaryOrder: String(primary.order),
          secondaryOrder: '',
        });
        continue;
      }

      for (const secondary of children) {
        rows.push({
          level: 'SECONDARY',
          primary: primary.name,
          secondary: secondary.name,
          primaryOrder: String(primary.order),
          secondaryOrder: String(secondary.order),
        });
      }
    }

    return serializeCsv({
      headers: [
        'level',
        'primary',
        'secondary',
        'primaryOrder',
        'secondaryOrder',
      ],
      rows,
      quote: 'all',
    });
  }

  async importRulesCsv(
    ownerId: string,
    file: { buffer: Buffer },
  ): Promise<{ createdCount: number; updatedCount: number }> {
    const rows = this.parseRulesCsv(file.buffer.toString('utf8'));

    return this.prisma.$transaction(async (tx) => {
      const categories = await this.categoriesService.findAll(ownerId, {
        includeArchived: true,
      });
      const secondaryByKey = new Map<string, string>();

      for (const category of categories) {
        if (
          category.type !== 'EXPENSE' ||
          category.parentCategoryId === null ||
          category.archivedAt !== null ||
          category.parentCategory?.archivedAt !== null
        ) {
          continue;
        }

        secondaryByKey.set(
          this.secondaryLookupKey(category.parentCategory.name, category.name),
          category.id,
        );
      }

      let createdCount = 0;
      let updatedCount = 0;
      for (const row of rows) {
        const secondaryCategoryId = secondaryByKey.get(
          this.secondaryLookupKey(row.primary, row.secondary),
        );
        if (!secondaryCategoryId) {
          throw new BadRequestException(
            `rules.csv row ${row.rowNumber} references a missing active expense secondary category.`,
          );
        }

        const existing = await tx.expenseValidationRule.findFirst({
          where: {
            userId: ownerId,
            normalizedEntry: row.normalizedEntry,
          },
        });

        if (existing) {
          await tx.expenseValidationRule.update({
            where: { id: existing.id },
            data: {
              entry: row.entry,
              normalizedEntry: row.normalizedEntry,
              secondaryCategoryId,
            },
          });
          updatedCount += 1;
        } else {
          await tx.expenseValidationRule.create({
            data: {
              userId: ownerId,
              entry: row.entry,
              normalizedEntry: row.normalizedEntry,
              secondaryCategoryId,
            },
          });
          createdCount += 1;
        }
      }

      return { createdCount, updatedCount };
    });
  }

  async importHierarchyCsv(
    ownerId: string,
    file: { buffer: Buffer },
  ): Promise<{ createdCount: number; updatedCount: number }> {
    const rows = this.parseHierarchyCsv(file.buffer.toString('utf8'));

    return this.prisma.$transaction(async (tx) => {
      const allCategories = await tx.category.findMany({
        where: {
          userId: ownerId,
          type: 'EXPENSE',
        },
        include: {
          parentCategory: true,
        },
      });

      const primaryByName = new Map<string, (typeof allCategories)[number]>();
      for (const category of allCategories) {
        if (category.parentCategoryId === null) {
          primaryByName.set(this.normalizeName(category.name), category);
        }
      }

      let createdCount = 0;
      let updatedCount = 0;

      for (const row of rows) {
        const primary = await this.upsertPrimaryCategory(
          tx,
          ownerId,
          primaryByName,
          row.primary,
          row.primaryOrder,
        );
        if (primary.wasCreated) {
          createdCount += 1;
        } else if (primary.wasUpdated) {
          updatedCount += 1;
        }

        if (row.level === 'PRIMARY') {
          continue;
        }

        const secondary = await this.upsertSecondaryCategory(
          tx,
          ownerId,
          primary.category.id,
          row.secondary!,
          row.secondaryOrder,
        );
        if (secondary.wasCreated) {
          createdCount += 1;
        } else if (secondary.wasUpdated) {
          updatedCount += 1;
        }
      }

      return { createdCount, updatedCount };
    });
  }

  private async upsertRule(
    client: ValidationClient,
    ownerId: string,
    input: { entry: string; secondaryCategoryId: string },
    excludeId?: string,
  ): Promise<ExpenseValidationRuleRecord> {
    const entry = input.entry.trim();
    if (!entry) {
      throw new BadRequestException('Entry is required.');
    }

    const normalizedEntry = normalizeExpenseValidationEntry(entry);
    const existingByEntry = await client.expenseValidationRule.findFirst({
      where: {
        userId: ownerId,
        normalizedEntry,
      },
    });

    if (existingByEntry && existingByEntry.id !== excludeId) {
      throw new ConflictException(
        `An expense validation rule for "${entry}" already exists.`,
      );
    }

    const category = await this.categoriesService.getAssignableCategory(
      ownerId,
      input.secondaryCategoryId,
      'EXPENSE',
      excludeId
        ? (await this.requireRule(client, ownerId, excludeId))
            .secondaryCategoryId
        : undefined,
    );
    if (!category.parentCategoryId) {
      throw new BadRequestException(
        'Expense validation rules must point to expense secondary categories.',
      );
    }

    if (excludeId) {
      await client.expenseValidationRule.update({
        where: { id: excludeId },
        data: {
          entry,
          normalizedEntry,
          secondaryCategoryId: category.id,
        },
      });
      return this.requireRule(client, ownerId, excludeId);
    }

    const created = await client.expenseValidationRule.create({
      data: {
        userId: ownerId,
        entry,
        normalizedEntry,
        secondaryCategoryId: category.id,
      },
    });
    return this.requireRule(client, ownerId, created.id);
  }

  private async requireRule(
    client: ValidationClient,
    ownerId: string,
    id: string,
  ): Promise<ExpenseValidationRuleRecord> {
    const rule = await client.expenseValidationRule.findFirst({
      where: {
        id,
        userId: ownerId,
      },
      include: {
        secondaryCategory: {
          include: {
            parentCategory: true,
          },
        },
      },
    });

    if (!rule) {
      throw new NotFoundException(
        `Expense validation rule ${id} was not found.`,
      );
    }

    return rule;
  }

  private parseHierarchyCsv(content: string): ParsedHierarchyRow[] {
    const { headers, rows } = parseCsvTable(content);
    this.assertHeaders(headers, [
      'level',
      'primary',
      'secondary',
      'primaryOrder',
      'secondaryOrder',
    ]);
    const seenPrimaryKeys = new Set<string>();
    const seenSecondaryKeys = new Set<string>();

    return rows.map(({ rowNumber, values: row }) => {
      const level = this.requiredCell(
        row.level,
        'level',
        rowNumber,
      ).toUpperCase();
      if (level !== 'PRIMARY' && level !== 'SECONDARY') {
        throw new BadRequestException(
          `hierarchy.csv row ${rowNumber} has an invalid level.`,
        );
      }

      const primary = this.requiredCell(row.primary, 'primary', rowNumber);
      const secondary = this.optionalCell(row.secondary);
      if (level === 'PRIMARY' && secondary) {
        throw new BadRequestException(
          `hierarchy.csv row ${rowNumber} cannot set secondary for a PRIMARY row.`,
        );
      }
      if (level === 'SECONDARY' && !secondary) {
        throw new BadRequestException(
          `hierarchy.csv row ${rowNumber} requires a secondary value.`,
        );
      }

      if (level === 'PRIMARY') {
        const key = this.normalizeName(primary);
        if (seenPrimaryKeys.has(key)) {
          throw new BadRequestException(
            `hierarchy.csv row ${rowNumber} duplicates primary "${primary}".`,
          );
        }
        seenPrimaryKeys.add(key);
      } else {
        const key = this.secondaryLookupKey(primary, secondary!);
        if (seenSecondaryKeys.has(key)) {
          throw new BadRequestException(
            `hierarchy.csv row ${rowNumber} duplicates secondary "${secondary}" under "${primary}".`,
          );
        }
        seenSecondaryKeys.add(key);
      }

      return {
        rowNumber,
        level,
        primary,
        secondary,
        primaryOrder: this.optionalInteger(
          row.primaryOrder,
          rowNumber,
          'primaryOrder',
        ),
        secondaryOrder: this.optionalInteger(
          row.secondaryOrder,
          rowNumber,
          'secondaryOrder',
        ),
      };
    });
  }

  private parseRulesCsv(content: string): ParsedRuleRow[] {
    const { headers, rows } = parseCsvTable(content);
    this.assertHeaders(headers, ['entry', 'primary', 'secondary']);
    const seenEntries = new Set<string>();

    return rows.map(({ rowNumber, values: row }) => {
      const entry = this.requiredCell(row.entry, 'entry', rowNumber);
      const normalizedEntry = normalizeExpenseValidationEntry(entry);
      if (seenEntries.has(normalizedEntry)) {
        throw new BadRequestException(
          `rules.csv row ${rowNumber} duplicates entry "${entry}".`,
        );
      }
      seenEntries.add(normalizedEntry);

      return {
        rowNumber,
        entry,
        normalizedEntry,
        primary: this.requiredCell(row.primary, 'primary', rowNumber),
        secondary: this.requiredCell(row.secondary, 'secondary', rowNumber),
      };
    });
  }

  private assertHeaders(headers: string[], expected: string[]): string[] {
    const normalized = headers.map((header) => header.trim());
    if (
      normalized.length !== expected.length ||
      normalized.some((header, index) => header !== expected[index])
    ) {
      throw new BadRequestException(
        `CSV headers must be exactly: ${expected.join(', ')}.`,
      );
    }

    return normalized;
  }

  private requiredCell(
    value: string,
    field: string,
    rowNumber: number,
  ): string {
    const trimmed = value.trim();
    if (!trimmed) {
      throw new BadRequestException(`CSV row ${rowNumber} requires ${field}.`);
    }
    return trimmed;
  }

  private optionalCell(value: string): string | null {
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }

  private optionalInteger(
    value: string,
    rowNumber: number,
    field: string,
  ): number | null {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }
    const parsed = Number(trimmed);
    if (!Number.isInteger(parsed) || parsed < 0) {
      throw new BadRequestException(
        `CSV row ${rowNumber} has an invalid ${field}.`,
      );
    }
    return parsed;
  }

  private normalizeName(value: string): string {
    return value.trim().toLocaleLowerCase('en-US');
  }

  private secondaryLookupKey(primary: string, secondary: string): string {
    return `${this.normalizeName(primary)}::${this.normalizeName(secondary)}`;
  }

  private async upsertPrimaryCategory(
    client: ValidationClient,
    ownerId: string,
    primaryByName: Map<
      string,
      Prisma.CategoryGetPayload<{ include: { parentCategory: true } }>
    >,
    primaryName: string,
    order: number | null,
  ): Promise<{
    category: Prisma.CategoryGetPayload<{ include: { parentCategory: true } }>;
    wasCreated: boolean;
    wasUpdated: boolean;
  }> {
    const normalizedName = this.normalizeName(primaryName);
    const existing = primaryByName.get(normalizedName);

    if (existing) {
      const shouldUpdate =
        existing.archivedAt !== null ||
        existing.order !== (order ?? existing.order);
      const updated = shouldUpdate
        ? await client.category.update({
            where: { id: existing.id },
            data: {
              archivedAt: null,
              order: order ?? existing.order,
            },
            include: {
              parentCategory: true,
            },
          })
        : existing;
      primaryByName.set(normalizedName, updated);
      return { category: updated, wasCreated: false, wasUpdated: shouldUpdate };
    }

    const created = await client.category.create({
      data: {
        userId: ownerId,
        name: primaryName,
        type: 'EXPENSE',
        parentCategoryId: null,
        order: order ?? 0,
        archivedAt: null,
      },
      include: {
        parentCategory: true,
      },
    });
    primaryByName.set(normalizedName, created);
    return { category: created, wasCreated: true, wasUpdated: false };
  }

  private async upsertSecondaryCategory(
    client: ValidationClient,
    ownerId: string,
    primaryCategoryId: string,
    secondaryName: string,
    order: number | null,
  ): Promise<{ wasCreated: boolean; wasUpdated: boolean }> {
    const existing = await client.category.findFirst({
      where: {
        userId: ownerId,
        type: 'EXPENSE',
        parentCategoryId: primaryCategoryId,
        name: {
          equals: secondaryName,
          mode: 'insensitive',
        },
      },
    });

    if (existing) {
      const shouldUpdate =
        existing.archivedAt !== null ||
        existing.order !== (order ?? existing.order);
      if (shouldUpdate) {
        await client.category.update({
          where: { id: existing.id },
          data: {
            archivedAt: null,
            order: order ?? existing.order,
          },
        });
      }
      return { wasCreated: false, wasUpdated: shouldUpdate };
    }

    await client.category.create({
      data: {
        userId: ownerId,
        name: secondaryName,
        type: 'EXPENSE',
        parentCategoryId: primaryCategoryId,
        order: order ?? 0,
        archivedAt: null,
      },
    });
    return { wasCreated: true, wasUpdated: false };
  }
}
