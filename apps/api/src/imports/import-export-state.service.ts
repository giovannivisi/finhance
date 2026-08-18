import { ConflictException } from '@nestjs/common';
import { PrismaService } from '@prisma/prisma.service';
import { Prisma, TransactionKind } from '@finhance/db';
import {
  resolveTransferRowsForExport,
  type ExportState,
} from '@imports/import-export';

type ImportDbClient = PrismaService | Prisma.TransactionClient;
const CSV_IMPORT_SOURCE = 'CSV_TEMPLATE' as const;

export class ImportExportStateService {
  async backfillExportImportKeys(
    db: ImportDbClient,
    ownerId: string,
  ): Promise<void> {
    await this.backfillAccountExportImportKeys(db, ownerId);
    await this.backfillCategoryExportImportKeys(db, ownerId);
    await this.backfillRecurringRuleExportImportKeys(db, ownerId);
    await this.backfillBudgetExportImportKeys(db, ownerId);
    await this.backfillAssetExportImportKeys(db, ownerId);
    await this.backfillTransactionExportImportKeys(db, ownerId);
  }

  private isLegacyManualKey(key: string | null): boolean {
    if (!key) return false;
    return /^manual-(account|category|asset|recurring-rule|budget|transaction|transfer)-[a-z0-9]{20,}$/.test(
      key,
    );
  }

  private generateReadableImportKey(
    prefix: string,
    parts: string[],
    usedKeys: Set<string>,
  ): string {
    const slug = parts
      .join('-')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    const base = `${prefix}-${slug}`;
    if (!usedKeys.has(base)) {
      usedKeys.add(base);
      return base;
    }
    let counter = 2;
    while (usedKeys.has(`${base}-${counter}`)) {
      counter++;
    }
    const key = `${base}-${counter}`;
    usedKeys.add(key);
    return key;
  }

  private async backfillAccountExportImportKeys(
    db: ImportDbClient,
    ownerId: string,
  ): Promise<void> {
    const rows = await db.account.findMany({
      where: { userId: ownerId },
      orderBy: { createdAt: 'asc' },
    });

    const usedKeys = new Set<string>(
      rows
        .filter((r) => r.importKey && !this.isLegacyManualKey(r.importKey))
        .map((r) => r.importKey!),
    );

    for (const row of rows) {
      if (
        row.importSource === CSV_IMPORT_SOURCE &&
        row.importKey &&
        !this.isLegacyManualKey(row.importKey)
      ) {
        continue;
      }
      const importKey = this.generateReadableImportKey(
        'account',
        [row.name, row.currency],
        usedKeys,
      );

      await db.account.update({
        where: { id: row.id },
        data: {
          importSource: CSV_IMPORT_SOURCE,
          importKey,
        },
      });
    }
  }

  private async backfillCategoryExportImportKeys(
    db: ImportDbClient,
    ownerId: string,
  ): Promise<void> {
    const rows = await db.category.findMany({
      where: { userId: ownerId },
      orderBy: { createdAt: 'asc' },
      include: { parentCategory: true },
    });

    const usedKeys = new Set<string>(
      rows
        .filter((r) => r.importKey && !this.isLegacyManualKey(r.importKey))
        .map((r) => r.importKey!),
    );

    for (const row of rows) {
      if (
        row.importSource === CSV_IMPORT_SOURCE &&
        row.importKey &&
        !this.isLegacyManualKey(row.importKey)
      ) {
        continue;
      }
      const parts = row.parentCategory
        ? [row.type, row.parentCategory.name, row.name]
        : [row.type, row.name];
      const importKey = this.generateReadableImportKey(
        'category',
        parts,
        usedKeys,
      );

      await db.category.update({
        where: { id: row.id },
        data: {
          importSource: CSV_IMPORT_SOURCE,
          importKey,
        },
      });
    }
  }

  private async backfillAssetExportImportKeys(
    db: ImportDbClient,
    ownerId: string,
  ): Promise<void> {
    const rows = await db.asset.findMany({
      where: { userId: ownerId },
      orderBy: { createdAt: 'asc' },
    });

    const usedKeys = new Set<string>(
      rows
        .filter((r) => r.importKey && !this.isLegacyManualKey(r.importKey))
        .map((r) => r.importKey!),
    );

    for (const row of rows) {
      if (
        row.importSource === CSV_IMPORT_SOURCE &&
        row.importKey &&
        !this.isLegacyManualKey(row.importKey)
      ) {
        continue;
      }
      const importKey = this.generateReadableImportKey(
        'asset',
        [row.name, row.currency],
        usedKeys,
      );

      await db.asset.update({
        where: { id: row.id },
        data: {
          importSource: CSV_IMPORT_SOURCE,
          importKey,
        },
      });
    }
  }

  private async backfillRecurringRuleExportImportKeys(
    db: ImportDbClient,
    ownerId: string,
  ): Promise<void> {
    const rows = await db.recurringTransactionRule.findMany({
      where: { userId: ownerId },
      orderBy: { createdAt: 'asc' },
    });

    const usedKeys = new Set<string>(
      rows
        .filter((r) => r.importKey && !this.isLegacyManualKey(r.importKey))
        .map((r) => r.importKey!),
    );

    for (const row of rows) {
      if (
        row.importSource === CSV_IMPORT_SOURCE &&
        row.importKey &&
        !this.isLegacyManualKey(row.importKey)
      ) {
        continue;
      }
      const importKey = this.generateReadableImportKey(
        'recurring',
        [row.name],
        usedKeys,
      );

      await db.recurringTransactionRule.update({
        where: { id: row.id },
        data: {
          importSource: CSV_IMPORT_SOURCE,
          importKey,
        },
      });
    }
  }

  private async backfillBudgetExportImportKeys(
    db: ImportDbClient,
    ownerId: string,
  ): Promise<void> {
    const rows = await db.categoryBudget.findMany({
      where: { userId: ownerId },
      orderBy: { createdAt: 'asc' },
      include: { category: true },
    });

    const usedKeys = new Set<string>(
      rows
        .filter((r) => r.importKey && !this.isLegacyManualKey(r.importKey))
        .map((r) => r.importKey!),
    );

    for (const row of rows) {
      if (
        row.importSource === CSV_IMPORT_SOURCE &&
        row.importKey &&
        !this.isLegacyManualKey(row.importKey)
      ) {
        continue;
      }
      const importKey = this.generateReadableImportKey(
        'budget',
        [row.category.name, row.currency],
        usedKeys,
      );

      await db.categoryBudget.update({
        where: { id: row.id },
        data: {
          importSource: CSV_IMPORT_SOURCE,
          importKey,
        },
      });
    }
  }

  private async backfillTransactionExportImportKeys(
    db: ImportDbClient,
    ownerId: string,
  ): Promise<void> {
    const rows = await db.transaction.findMany({
      where: { userId: ownerId },
      orderBy: [{ postedAt: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
      include: { account: true },
    });
    const usedKeys = new Set<string>(
      rows
        .filter((r) => r.importKey && !this.isLegacyManualKey(r.importKey))
        .map((r) => r.importKey!),
    );
    const transferGroups = new Map<string, (typeof rows)[number][]>();

    for (const row of rows) {
      if (row.kind !== TransactionKind.TRANSFER) {
        if (
          row.importSource === CSV_IMPORT_SOURCE &&
          row.importKey &&
          !this.isLegacyManualKey(row.importKey)
        ) {
          continue;
        }
        const dateStr = row.postedAt.toISOString().slice(0, 10);
        const descSlug = row.description.slice(0, 30);
        const importKey = this.generateReadableImportKey(
          'tx',
          [dateStr, descSlug, row.account.name],
          usedKeys,
        );

        await db.transaction.update({
          where: { id: row.id },
          data: {
            importSource: CSV_IMPORT_SOURCE,
            importKey,
          },
        });
        continue;
      }

      if (!row.transferGroupId) {
        throw new ConflictException(
          `Transfer ${row.id} is missing a transfer group id and cannot be exported.`,
        );
      }

      const existing = transferGroups.get(row.transferGroupId) ?? [];
      existing.push(row);
      transferGroups.set(row.transferGroupId, existing);
    }

    for (const [transferGroupId, groupRows] of transferGroups.entries()) {
      const allHaveReadableKeys = groupRows.every(
        (r) =>
          r.importSource === CSV_IMPORT_SOURCE &&
          r.importKey &&
          !this.isLegacyManualKey(r.importKey),
      );
      if (allHaveReadableKeys) continue;

      const { outflow, importKey: existingKey } = resolveTransferRowsForExport(
        transferGroupId,
        groupRows,
      );

      let importKey = existingKey;
      if (importKey.startsWith('manual-transfer-')) {
        const dateStr = outflow.postedAt.toISOString().slice(0, 10);
        const descSlug = outflow.description.slice(0, 30);
        importKey = this.generateReadableImportKey(
          'transfer',
          [dateStr, descSlug],
          usedKeys,
        );
      }

      for (const row of groupRows) {
        if (
          row.importSource === CSV_IMPORT_SOURCE &&
          row.importKey === importKey
        ) {
          continue;
        }

        await db.transaction.update({
          where: { id: row.id },
          data: {
            importSource: CSV_IMPORT_SOURCE,
            importKey,
          },
        });
      }
    }
  }

  async loadExportState(
    db: ImportDbClient,
    ownerId: string,
  ): Promise<ExportState> {
    const [
      accounts,
      categories,
      assets,
      transactions,
      recurringRules,
      budgets,
      expenseValidationRules,
    ] = await Promise.all([
      db.account.findMany({
        where: { userId: ownerId },
        orderBy: [{ order: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
      }),
      db.category.findMany({
        where: { userId: ownerId },
        orderBy: [{ order: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
      }),
      db.asset.findMany({
        where: { userId: ownerId },
        include: {
          account: true,
        },
        orderBy: [{ order: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
      }),
      db.transaction.findMany({
        where: { userId: ownerId },
        include: {
          account: true,
          category: true,
        },
        orderBy: [{ postedAt: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
      }),
      db.recurringTransactionRule.findMany({
        where: { userId: ownerId },
        include: {
          occurrences: {
            orderBy: [{ occurrenceMonth: 'asc' }, { createdAt: 'asc' }],
          },
        },
        orderBy: [{ dayOfMonth: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
      }),
      db.categoryBudget.findMany({
        where: { userId: ownerId },
        include: {
          category: true,
          overrides: {
            orderBy: [{ month: 'asc' }, { createdAt: 'asc' }],
          },
        },
        orderBy: [{ startMonth: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
      }),
      'expenseValidationRule' in db && db.expenseValidationRule
        ? db.expenseValidationRule.findMany({
            where: { userId: ownerId },
            include: {
              secondaryCategory: {
                include: {
                  parentCategory: true,
                },
              },
            },
            orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          })
        : Promise.resolve([]),
    ]);

    return {
      accounts,
      categories,
      assets,
      transactions,
      recurringRules,
      budgets,
      expenseValidationRules,
    };
  }
}
