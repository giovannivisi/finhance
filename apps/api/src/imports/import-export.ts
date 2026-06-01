import { ConflictException } from '@nestjs/common';
import { serializeCsv } from '@/common/csv';
import { buildStoredZipArchive, type ZipArchiveEntry } from '@/common/zip';
import {
  Account,
  AssetKind,
  AssetType,
  Category,
  CategoryType,
  Prisma,
  Transaction,
  TransactionDirection,
  TransactionKind,
} from '@finhance/db';
import type { ImportFileType } from '@finhance/shared';
import { IMPORT_TEMPLATE_HEADERS } from '@imports/imports.types';

export type ExportAssetRecord = Prisma.AssetGetPayload<{
  include: {
    account: true;
  };
}>;

export type ExportTransactionRecord = Prisma.TransactionGetPayload<{
  include: {
    account: true;
    category: true;
  };
}>;

export type ExportRecurringRuleRecord =
  Prisma.RecurringTransactionRuleGetPayload<{
    include: {
      occurrences: true;
    };
  }>;

export type ExportBudgetRecord = Prisma.CategoryBudgetGetPayload<{
  include: {
    overrides: true;
    category: true;
  };
}>;

export type ExportExpenseValidationRuleRecord =
  Prisma.ExpenseValidationRuleGetPayload<{
    include: {
      secondaryCategory: {
        include: {
          parentCategory: true;
        };
      };
    };
  }>;

export interface ExportState {
  accounts: Account[];
  categories: Category[];
  assets: ExportAssetRecord[];
  transactions: ExportTransactionRecord[];
  recurringRules: ExportRecurringRuleRecord[];
  budgets: ExportBudgetRecord[];
  expenseValidationRules: ExportExpenseValidationRuleRecord[];
}

export interface ExportArchiveResult {
  filename: string;
  buffer: Buffer;
}

type CsvRecord = Record<string, string>;

const MARKET_ASSET_KINDS = new Set<AssetKind>([
  AssetKind.STOCK,
  AssetKind.BOND,
  AssetKind.CRYPTO,
]);
const EXPORT_DATE_FORMATTER = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Rome',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});
const EXPORT_FILE_NAMES: Record<ImportFileType, string> = {
  accounts: 'accounts.csv',
  categories: 'categories.csv',
  assets: 'assets.csv',
  transactions: 'transactions.csv',
  recurringRules: 'recurringRules.csv',
  recurringExceptions: 'recurringExceptions.csv',
  budgets: 'budgets.csv',
  budgetOverrides: 'budgetOverrides.csv',
  expenseCategoryHierarchy: 'expenseCategoryHierarchy.csv',
  expenseValidationRules: 'expenseValidationRules.csv',
};

export function buildImportExportArchive(
  state: ExportState,
  now: Date = new Date(),
): ExportArchiveResult {
  return {
    filename: `finhance-export-${formatExportDate(now)}.zip`,
    buffer: buildStoredZipArchive(buildExportFiles(state)),
  };
}

export function buildImportTemplateArchive(
  now: Date = new Date(),
): ExportArchiveResult {
  return {
    filename: `finhance-import-templates-${formatExportDate(now)}.zip`,
    buffer: buildStoredZipArchive(buildTemplateFiles()),
  };
}

export function resolveTransferRowsForExport<T extends Transaction>(
  transferGroupId: string,
  rows: T[],
): { outflow: T; inflow: T; importKey: string } {
  if (rows.length !== 2) {
    throw new ConflictException(
      `Transfer ${transferGroupId} is incomplete and cannot be exported.`,
    );
  }

  const outflow = rows.find(
    (row) => row.direction === TransactionDirection.OUTFLOW,
  );
  const inflow = rows.find(
    (row) => row.direction === TransactionDirection.INFLOW,
  );

  if (!outflow || !inflow) {
    throw new ConflictException(
      `Transfer ${transferGroupId} is missing one direction and cannot be exported.`,
    );
  }

  const importKeys = [
    ...new Set(rows.map((row) => row.importKey).filter(Boolean)),
  ];
  if (importKeys.length > 1) {
    throw new ConflictException(
      `Transfer ${transferGroupId} uses inconsistent import keys and cannot be exported.`,
    );
  }

  return {
    outflow,
    inflow,
    importKey: importKeys[0] ?? `manual-transfer-${transferGroupId}`,
  };
}

function buildExportFiles(state: ExportState): ZipArchiveEntry[] {
  const accountImportKeys = new Map<string, string>();
  const categoryImportKeys = new Map<string, string>();
  const categoriesById = new Map(
    state.categories.map((category) => [category.id, category]),
  );
  const recurringRuleImportKeys = new Map<string, string>();
  const budgetImportKeys = new Map<string, string>();

  for (const account of state.accounts) {
    const importKey = account.importKey;
    if (!importKey) {
      throw new ConflictException(
        `Account ${account.id} could not be exported without an import key.`,
      );
    }

    accountImportKeys.set(account.id, importKey);
  }

  for (const category of state.categories) {
    const importKey = category.importKey;
    if (!importKey) {
      throw new ConflictException(
        `Category ${category.id} could not be exported without an import key.`,
      );
    }

    categoryImportKeys.set(category.id, importKey);
  }

  for (const rule of state.recurringRules) {
    const importKey = rule.importKey;
    if (!importKey) {
      throw new ConflictException(
        `Recurring rule ${rule.id} could not be exported without an import key.`,
      );
    }

    recurringRuleImportKeys.set(rule.id, importKey);
  }

  for (const budget of state.budgets) {
    const importKey = budget.importKey;
    if (!importKey) {
      throw new ConflictException(
        `Budget ${budget.id} could not be exported without an import key.`,
      );
    }

    budgetImportKeys.set(budget.id, importKey);
  }

  const accountCsv = serializeCsv({
    headers: [...IMPORT_TEMPLATE_HEADERS.accounts],
    rows: state.accounts.map((account) => toExportAccountRow(account)),
    trailingNewline: true,
  });
  const categoryCsv = serializeCsv({
    headers: [...IMPORT_TEMPLATE_HEADERS.categories],
    rows: state.categories.map((category) =>
      toExportCategoryRow(category, categoriesById),
    ),
    trailingNewline: true,
  });
  const assetCsv = serializeCsv({
    headers: [...IMPORT_TEMPLATE_HEADERS.assets],
    rows: state.assets.map((asset) =>
      toExportAssetRow(asset, accountImportKeys),
    ),
    trailingNewline: true,
  });
  const transactionCsv = serializeCsv({
    headers: [...IMPORT_TEMPLATE_HEADERS.transactions],
    rows: toExportTransactionRows(
      state.transactions.filter((row) => row.recurringRuleId === null),
      accountImportKeys,
      categoryImportKeys,
    ),
    trailingNewline: true,
  });
  const recurringRuleCsv = serializeCsv({
    headers: [...IMPORT_TEMPLATE_HEADERS.recurringRules],
    rows: state.recurringRules.map((rule) =>
      toExportRecurringRuleRow(rule, accountImportKeys, categoryImportKeys),
    ),
    trailingNewline: true,
  });
  const recurringExceptionCsv = serializeCsv({
    headers: [...IMPORT_TEMPLATE_HEADERS.recurringExceptions],
    rows: toExportRecurringExceptionRows(
      state.recurringRules,
      recurringRuleImportKeys,
      accountImportKeys,
      categoryImportKeys,
    ),
    trailingNewline: true,
  });
  const budgetCsv = serializeCsv({
    headers: [...IMPORT_TEMPLATE_HEADERS.budgets],
    rows: state.budgets.map((budget) =>
      toExportBudgetRow(budget, categoryImportKeys),
    ),
    trailingNewline: true,
  });
  const budgetOverrideCsv = serializeCsv({
    headers: [...IMPORT_TEMPLATE_HEADERS.budgetOverrides],
    rows: toExportBudgetOverrideRows(state.budgets, budgetImportKeys),
    trailingNewline: true,
  });
  const expenseValidationRulesCsv = serializeCsv({
    headers: [...IMPORT_TEMPLATE_HEADERS.expenseValidationRules],
    rows: state.expenseValidationRules.map((rule) =>
      toExportExpenseValidationRuleRow(rule),
    ),
    trailingNewline: true,
  });

  return [
    {
      name: EXPORT_FILE_NAMES.accounts,
      data: Buffer.from(accountCsv, 'utf8'),
    },
    {
      name: EXPORT_FILE_NAMES.categories,
      data: Buffer.from(categoryCsv, 'utf8'),
    },
    {
      name: EXPORT_FILE_NAMES.assets,
      data: Buffer.from(assetCsv, 'utf8'),
    },
    {
      name: EXPORT_FILE_NAMES.transactions,
      data: Buffer.from(transactionCsv, 'utf8'),
    },
    {
      name: EXPORT_FILE_NAMES.recurringRules,
      data: Buffer.from(recurringRuleCsv, 'utf8'),
    },
    {
      name: EXPORT_FILE_NAMES.recurringExceptions,
      data: Buffer.from(recurringExceptionCsv, 'utf8'),
    },
    {
      name: EXPORT_FILE_NAMES.budgets,
      data: Buffer.from(budgetCsv, 'utf8'),
    },
    {
      name: EXPORT_FILE_NAMES.budgetOverrides,
      data: Buffer.from(budgetOverrideCsv, 'utf8'),
    },
    {
      name: EXPORT_FILE_NAMES.expenseValidationRules,
      data: Buffer.from(expenseValidationRulesCsv, 'utf8'),
    },
  ];
}

function buildTemplateFiles(): ZipArchiveEntry[] {
  return (Object.keys(EXPORT_FILE_NAMES) as ImportFileType[]).map((file) => ({
    name: EXPORT_FILE_NAMES[file],
    data: Buffer.from(
      serializeCsv({
        headers: [...IMPORT_TEMPLATE_HEADERS[file]],
        rows: [],
        trailingNewline: true,
      }),
      'utf8',
    ),
  }));
}

function toExportTransactionRows(
  rows: ExportTransactionRecord[],
  accountImportKeys: Map<string, string>,
  categoryImportKeys: Map<string, string>,
): CsvRecord[] {
  const transferGroups = new Map<string, ExportTransactionRecord[]>();
  const orderedRows: CsvRecord[] = [];

  for (const row of rows) {
    if (row.kind === TransactionKind.TRANSFER) {
      if (!row.transferGroupId) {
        throw new ConflictException(
          `Transfer ${row.id} is missing a transfer group id and cannot be exported.`,
        );
      }

      const existing = transferGroups.get(row.transferGroupId) ?? [];
      existing.push(row);
      transferGroups.set(row.transferGroupId, existing);
      continue;
    }
  }

  const seenTransferGroups = new Set<string>();

  for (const row of rows) {
    if (row.kind !== TransactionKind.TRANSFER) {
      orderedRows.push(
        toExportStandardTransactionRow(
          row,
          accountImportKeys,
          categoryImportKeys,
        ),
      );
      continue;
    }

    if (!row.transferGroupId || seenTransferGroups.has(row.transferGroupId)) {
      continue;
    }

    const groupRows = transferGroups.get(row.transferGroupId) ?? [];
    orderedRows.push(
      toExportTransferCsvRow(row.transferGroupId, groupRows, accountImportKeys),
    );
    seenTransferGroups.add(row.transferGroupId);
  }

  return orderedRows;
}

function toExportAccountRow(account: Account): CsvRecord {
  if (!account.importKey) {
    throw new ConflictException(
      `Account ${account.id} could not be exported without an import key.`,
    );
  }

  return {
    importKey: account.importKey,
    name: account.name,
    type: account.type,
    currency: account.currency,
    institution: account.institution ?? '',
    notes: account.notes ?? '',
    order: serializeInteger(account.order),
    openingBalance: account.openingBalance.toString(),
    openingBalanceDate:
      account.openingBalanceDate?.toISOString().slice(0, 10) ?? '',
    archived: serializeBoolean(account.archivedAt !== null),
  };
}

function toExportCategoryRow(
  category: Category,
  categoriesById: Map<string, Category>,
): CsvRecord {
  if (!category.importKey) {
    throw new ConflictException(
      `Category ${category.id} could not be exported without an import key.`,
    );
  }

  const parentCategory = category.parentCategoryId
    ? (categoriesById.get(category.parentCategoryId) ?? null)
    : null;
  const isSecondary =
    category.type === CategoryType.EXPENSE && parentCategory !== null;

  return {
    importKey: category.importKey,
    type: category.type,
    level: isSecondary ? 'SECONDARY' : 'PRIMARY',
    primary: isSecondary ? parentCategory.name : category.name,
    secondary: isSecondary ? category.name : '',
    primaryOrder: serializeInteger(
      isSecondary ? parentCategory.order : category.order,
    ),
    secondaryOrder: isSecondary ? serializeInteger(category.order) : '',
    archived: serializeBoolean(category.archivedAt !== null),
  };
}

function toExportExpenseValidationRuleRow(
  rule: ExportExpenseValidationRuleRecord,
): CsvRecord {
  return {
    entry: rule.entry,
    primary: rule.secondaryCategory.parentCategory?.name ?? '',
    secondary: rule.secondaryCategory.name,
  };
}

function toExportAssetRow(
  asset: ExportAssetRecord,
  accountImportKeys: Map<string, string>,
): CsvRecord {
  if (!asset.importKey) {
    throw new ConflictException(
      `Asset ${asset.id} could not be exported without an import key.`,
    );
  }

  const accountImportKey = asset.accountId
    ? requireExportImportKey(
        accountImportKeys.get(asset.accountId),
        `Asset ${asset.id} references an account that cannot be exported.`,
      )
    : '';
  const isMarketAsset =
    asset.type === AssetType.ASSET &&
    asset.kind !== null &&
    isMarketKind(asset.kind);

  if (asset.type === AssetType.LIABILITY) {
    if (!asset.liabilityKind) {
      throw new ConflictException(
        `Liability ${asset.id} is missing liabilityKind and cannot be exported.`,
      );
    }

    if (
      asset.kind ||
      asset.ticker ||
      asset.exchange ||
      asset.quantity ||
      asset.unitPrice
    ) {
      throw new ConflictException(
        `Liability ${asset.id} contains asset-only market fields and cannot be exported.`,
      );
    }
  } else {
    if (!asset.kind) {
      throw new ConflictException(
        `Asset ${asset.id} is missing kind and cannot be exported.`,
      );
    }

    if (asset.liabilityKind) {
      throw new ConflictException(
        `Asset ${asset.id} contains liabilityKind and cannot be exported.`,
      );
    }

    if (isMarketAsset) {
      if (
        !asset.ticker ||
        asset.exchange === null ||
        !asset.quantity ||
        !asset.unitPrice
      ) {
        throw new ConflictException(
          `Market asset ${asset.id} is missing market fields and cannot be exported.`,
        );
      }
    } else if (
      asset.ticker ||
      asset.exchange ||
      asset.quantity ||
      asset.unitPrice
    ) {
      throw new ConflictException(
        `Non-market asset ${asset.id} contains market fields and cannot be exported.`,
      );
    }
  }

  return {
    importKey: asset.importKey,
    name: asset.name,
    type: asset.type,
    kind: asset.kind ?? '',
    liabilityKind: asset.liabilityKind ?? '',
    currency: asset.currency,
    balance: asset.balance.toString(),
    accountImportKey,
    ticker: asset.ticker ?? '',
    exchange: asset.exchange ?? '',
    quantity: asset.quantity?.toString() ?? '',
    unitPrice: asset.unitPrice?.toString() ?? '',
    notes: asset.notes ?? '',
    order: serializeOptionalInteger(asset.order),
  };
}

function toExportStandardTransactionRow(
  row: ExportTransactionRecord,
  accountImportKeys: Map<string, string>,
  categoryImportKeys: Map<string, string>,
): CsvRecord {
  if (row.kind === TransactionKind.TRANSFER) {
    throw new ConflictException(
      `Transfer ${row.id} cannot be exported as a standard transaction row.`,
    );
  }

  return {
    importKey: requireExportImportKey(
      row.importKey,
      `Transaction ${row.id} could not be exported without an import key.`,
    ),
    postedAt: row.postedAt.toISOString(),
    kind: row.kind,
    amount: row.amount.toString(),
    description: row.description,
    notes: row.notes ?? '',
    accountImportKey: requireExportImportKey(
      accountImportKeys.get(row.accountId),
      `Transaction ${row.id} references an account that cannot be exported.`,
    ),
    direction: row.direction,
    categoryImportKey: row.categoryId
      ? requireExportImportKey(
          categoryImportKeys.get(row.categoryId),
          `Transaction ${row.id} references a category that cannot be exported.`,
        )
      : '',
    counterparty: row.counterparty ?? '',
    sourceAccountImportKey: '',
    destinationAccountImportKey: '',
  };
}

function toExportTransferCsvRow(
  transferGroupId: string,
  rows: ExportTransactionRecord[],
  accountImportKeys: Map<string, string>,
): CsvRecord {
  const { outflow, inflow, importKey } = resolveTransferRowsForExport(
    transferGroupId,
    rows,
  );

  if (
    outflow.amount.toString() !== inflow.amount.toString() ||
    outflow.currency !== inflow.currency ||
    outflow.postedAt.toISOString() !== inflow.postedAt.toISOString() ||
    outflow.description !== inflow.description ||
    (outflow.notes ?? null) !== (inflow.notes ?? null)
  ) {
    throw new ConflictException(
      `Transfer ${transferGroupId} is inconsistent and cannot be exported as one logical row.`,
    );
  }

  return {
    importKey,
    postedAt: outflow.postedAt.toISOString(),
    kind: TransactionKind.TRANSFER,
    amount: outflow.amount.toString(),
    description: outflow.description,
    notes: outflow.notes ?? '',
    accountImportKey: '',
    direction: '',
    categoryImportKey: '',
    counterparty: '',
    sourceAccountImportKey: requireExportImportKey(
      accountImportKeys.get(outflow.accountId),
      `Transfer ${transferGroupId} references a source account that cannot be exported.`,
    ),
    destinationAccountImportKey: requireExportImportKey(
      accountImportKeys.get(inflow.accountId),
      `Transfer ${transferGroupId} references a destination account that cannot be exported.`,
    ),
  };
}

function toExportRecurringRuleRow(
  rule: ExportRecurringRuleRecord,
  accountImportKeys: Map<string, string>,
  categoryImportKeys: Map<string, string>,
): CsvRecord {
  if (!rule.importKey) {
    throw new ConflictException(
      `Recurring rule ${rule.id} could not be exported without an import key.`,
    );
  }

  return {
    importKey: rule.importKey,
    name: rule.name,
    isActive: serializeBoolean(rule.isActive),
    kind: rule.kind,
    amount: rule.amount.toString(),
    dayOfMonth: String(rule.dayOfMonth),
    startDate: rule.startDate.toISOString().slice(0, 10),
    endDate: rule.endDate?.toISOString().slice(0, 10) ?? '',
    accountImportKey: rule.accountId
      ? requireExportImportKey(
          accountImportKeys.get(rule.accountId),
          `Recurring rule ${rule.id} references an account that cannot be exported.`,
        )
      : '',
    direction: rule.direction ?? '',
    categoryImportKey: rule.categoryId
      ? requireExportImportKey(
          categoryImportKeys.get(rule.categoryId),
          `Recurring rule ${rule.id} references a category that cannot be exported.`,
        )
      : '',
    counterparty: rule.counterparty ?? '',
    sourceAccountImportKey: rule.sourceAccountId
      ? requireExportImportKey(
          accountImportKeys.get(rule.sourceAccountId),
          `Recurring rule ${rule.id} references a source account that cannot be exported.`,
        )
      : '',
    destinationAccountImportKey: rule.destinationAccountId
      ? requireExportImportKey(
          accountImportKeys.get(rule.destinationAccountId),
          `Recurring rule ${rule.id} references a destination account that cannot be exported.`,
        )
      : '',
    description: rule.description,
    notes: rule.notes ?? '',
  };
}

function toExportRecurringExceptionRows(
  rules: ExportRecurringRuleRecord[],
  recurringRuleImportKeys: Map<string, string>,
  accountImportKeys: Map<string, string>,
  categoryImportKeys: Map<string, string>,
): CsvRecord[] {
  return rules.flatMap((rule) =>
    rule.occurrences.map((occurrence) => ({
      recurringRuleImportKey: requireExportImportKey(
        recurringRuleImportKeys.get(rule.id),
        `Recurring exception ${occurrence.id} is missing its recurring rule import key.`,
      ),
      month: occurrence.occurrenceMonth.toISOString().slice(0, 7),
      status: occurrence.status,
      amount: occurrence.overrideAmount?.toString() ?? '',
      postedAtDate:
        occurrence.overridePostedAtDate?.toISOString().slice(0, 10) ?? '',
      accountImportKey: occurrence.overrideAccountId
        ? requireExportImportKey(
            accountImportKeys.get(occurrence.overrideAccountId),
            `Recurring exception ${occurrence.id} references an account that cannot be exported.`,
          )
        : '',
      direction: occurrence.overrideDirection ?? '',
      categoryImportKey: occurrence.overrideCategoryId
        ? requireExportImportKey(
            categoryImportKeys.get(occurrence.overrideCategoryId),
            `Recurring exception ${occurrence.id} references a category that cannot be exported.`,
          )
        : '',
      counterparty: occurrence.overrideCounterparty ?? '',
      sourceAccountImportKey: occurrence.overrideSourceAccountId
        ? requireExportImportKey(
            accountImportKeys.get(occurrence.overrideSourceAccountId),
            `Recurring exception ${occurrence.id} references a source account that cannot be exported.`,
          )
        : '',
      destinationAccountImportKey: occurrence.overrideDestinationAccountId
        ? requireExportImportKey(
            accountImportKeys.get(occurrence.overrideDestinationAccountId),
            `Recurring exception ${occurrence.id} references a destination account that cannot be exported.`,
          )
        : '',
      description: occurrence.overrideDescription ?? '',
      notes: occurrence.overrideNotes ?? '',
    })),
  );
}

function toExportBudgetRow(
  budget: ExportBudgetRecord,
  categoryImportKeys: Map<string, string>,
): CsvRecord {
  if (!budget.importKey) {
    throw new ConflictException(
      `Budget ${budget.id} could not be exported without an import key.`,
    );
  }

  return {
    importKey: budget.importKey,
    categoryImportKey: requireExportImportKey(
      categoryImportKeys.get(budget.categoryId),
      `Budget ${budget.id} references a category that cannot be exported.`,
    ),
    currency: budget.currency,
    amount: budget.amount.toString(),
    startMonth: budget.startMonth.toISOString().slice(0, 7),
    endMonth: budget.endMonth?.toISOString().slice(0, 7) ?? '',
  };
}

function toExportBudgetOverrideRows(
  budgets: ExportBudgetRecord[],
  budgetImportKeys: Map<string, string>,
): CsvRecord[] {
  return budgets.flatMap((budget) =>
    budget.overrides.map((override) => ({
      budgetImportKey: requireExportImportKey(
        budgetImportKeys.get(budget.id),
        `Budget override ${override.id} is missing its budget import key.`,
      ),
      month: override.month.toISOString().slice(0, 7),
      amount: override.amount.toString(),
      note: override.note ?? '',
    })),
  );
}

function formatExportDate(date: Date): string {
  return EXPORT_DATE_FORMATTER.format(date);
}

function serializeBoolean(value: boolean): string {
  return value ? 'true' : 'false';
}

function serializeInteger(value: number): string {
  return String(value);
}

function serializeOptionalInteger(value: number | null): string {
  return value === null ? '' : String(value);
}

function requireExportImportKey(
  value: string | null | undefined,
  message: string,
): string {
  if (!value) {
    throw new ConflictException(message);
  }

  return value;
}

function isMarketKind(kind: AssetKind | null): kind is AssetKind {
  return kind !== null && MARKET_ASSET_KINDS.has(kind);
}
