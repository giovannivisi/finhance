import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type {
  ImportBatchResponse,
  ImportBatchSummaryResponse,
  ImportFileSummaryResponse,
  ImportFileType,
  ImportPreviewResponse,
  ImportRowIssueResponse,
} from '@finhance/shared';
import { PricesService } from '@prices/prices.service';
import { PrismaService } from '@prisma/prisma.service';
import {
  Account,
  AccountType,
  Asset,
  AssetKind,
  AssetType,
  CategoryBudget,
  CategoryBudgetOverride,
  Category,
  CategoryType,
  ImportBatch,
  ImportBatchStatus,
  ImportSource,
  LiabilityKind,
  Prisma,
  RecurringOccurrenceStatus,
  RecurringTransactionOccurrence,
  RecurringTransactionRule,
  Transaction,
  TransactionDirection,
  TransactionKind,
} from '@prisma/client';
import { RecurringService } from '@recurring/recurring.service';
import { IMPORT_TEMPLATE_HEADERS } from '@imports/imports.types';
import type {
  AccountImportRow,
  AssetImportRow,
  BudgetImportRow,
  BudgetOverrideImportRow,
  CategoryImportRow,
  ImportAnalysisResult,
  ImportAnalysisState,
  ImportPayload,
  ImportUploadFile,
  RecurringExceptionImportRow,
  RecurringRuleImportRow,
  TransactionImportRow,
} from '@imports/imports.types';
type ImportDbClient = PrismaService | Prisma.TransactionClient;
type ExportAssetRecord = Prisma.AssetGetPayload<{
  include: {
    account: true;
  };
}>;
type ExportTransactionRecord = Prisma.TransactionGetPayload<{
  include: {
    account: true;
    category: true;
  };
}>;
type ExportRecurringRuleRecord = Prisma.RecurringTransactionRuleGetPayload<{
  include: {
    occurrences: true;
  };
}>;
type ExportBudgetRecord = Prisma.CategoryBudgetGetPayload<{
  include: {
    overrides: true;
    category: true;
  };
}>;

interface ExportState {
  accounts: Account[];
  categories: Category[];
  assets: ExportAssetRecord[];
  transactions: ExportTransactionRecord[];
  recurringRules: ExportRecurringRuleRecord[];
  budgets: ExportBudgetRecord[];
}

interface ExportArchiveResult {
  filename: string;
  buffer: Buffer;
}

interface ZipFileEntry {
  name: string;
  data: Buffer;
}

interface StoredPreviewPayload {
  ownerId: string;
  payload: ImportPayload;
  expiresAt: number;
}

interface AccountImportRef {
  id: string;
  currency: string;
  archived: boolean;
  openingBalanceDate: string | null;
}

interface CategoryImportRef {
  id: string;
  type: CategoryType;
  archived: boolean;
}

interface RecurringRuleImportRef {
  id: string;
  kind: TransactionKind;
}

interface BudgetImportRef {
  id: string;
}

const CSV_IMPORT_SOURCE = ImportSource.CSV_TEMPLATE;
const RECENT_BATCH_LIMIT = 20;
const IMPORT_PREVIEW_TTL_MS = 15 * 60 * 1000;
const MAX_UPLOAD_FILE_BYTES = 1024 * 1024;
const MAX_IMPORT_KEY_LENGTH = 128;
const MAX_NAME_LENGTH = 120;
const MAX_DESCRIPTION_LENGTH = 240;
const MAX_NOTES_LENGTH = 2_000;
const MAX_COUNTERPARTY_LENGTH = 120;
const MAX_TICKER_LENGTH = 32;
const MAX_EXCHANGE_LENGTH = 24;
const MARKET_ASSET_KINDS = new Set<AssetKind>([
  AssetKind.STOCK,
  AssetKind.BOND,
  AssetKind.CRYPTO,
]);
const CSV_TRUE_VALUES = new Set(['true', '1', 'yes']);
const CSV_FALSE_VALUES = new Set(['false', '0', 'no', '']);
const ZERO = new Prisma.Decimal(0);
const ZIP_STORE_METHOD = 0;
const ZIP_VERSION = 20;
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
};
const CRC32_TABLE = buildCrc32Table();

type CsvRecord = Record<string, string>;

@Injectable()
export class ImportsService {
  private readonly logger = new Logger(ImportsService.name);
  private readonly previewPayloads = new Map<string, StoredPreviewPayload>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly pricesService: PricesService,
    private readonly recurringService: RecurringService,
  ) {}

  async listRecent(ownerId: string): Promise<ImportBatchResponse[]> {
    await this.clearExpiredPersistedPreviewPayloads(ownerId);
    const batches = await this.prisma.importBatch.findMany({
      where: { userId: ownerId },
      orderBy: [{ createdAt: 'desc' }],
      take: RECENT_BATCH_LIMIT,
    });

    return batches.map((batch) => this.toImportBatchResponse(batch));
  }

  async findOne(
    ownerId: string,
    batchId: string,
  ): Promise<ImportBatchResponse> {
    await this.clearExpiredPersistedPreviewPayloads(ownerId);
    const batch = await this.prisma.importBatch.findFirst({
      where: { id: batchId, userId: ownerId },
    });

    if (!batch) {
      throw new NotFoundException(`Import batch ${batchId} was not found.`);
    }

    return this.toImportBatchResponse(batch);
  }

  async previewCsv(
    ownerId: string,
    files: Partial<Record<ImportFileType, ImportUploadFile>>,
  ): Promise<ImportPreviewResponse> {
    this.pruneExpiredPreviewPayloads();
    await this.clearExpiredPersistedPreviewPayloads(ownerId);

    const parsed = this.parseUploadedFiles(files);
    const analysis = await this.analyzePayload(
      this.prisma,
      ownerId,
      parsed.payload,
      parsed.issues,
    );
    const status = analysis.canApply
      ? ImportBatchStatus.PREVIEW
      : ImportBatchStatus.FAILED;

    const batch = await this.prisma.importBatch.create({
      data: {
        id: randomUUID(),
        userId: ownerId,
        source: CSV_IMPORT_SOURCE,
        status,
        summaryJson: this.toJsonValue(analysis.summary),
        errorJson: this.toJsonValue(analysis.issues),
        payloadJson: analysis.canApply
          ? this.toJsonValue(parsed.payload)
          : Prisma.DbNull,
      },
    });

    if (analysis.canApply) {
      this.previewPayloads.set(batch.id, {
        ownerId,
        payload: parsed.payload,
        expiresAt: Date.now() + IMPORT_PREVIEW_TTL_MS,
      });
    } else {
      this.previewPayloads.delete(batch.id);
    }

    return this.toImportPreviewResponse(batch, analysis.canApply);
  }

  async applyBatch(
    ownerId: string,
    batchId: string,
  ): Promise<ImportBatchResponse> {
    this.pruneExpiredPreviewPayloads();

    const batch = await this.prisma.importBatch.findFirst({
      where: { id: batchId, userId: ownerId },
    });

    if (!batch) {
      throw new NotFoundException(`Import batch ${batchId} was not found.`);
    }

    if (batch.status === ImportBatchStatus.APPLIED) {
      throw new ConflictException(
        'This import batch has already been applied.',
      );
    }

    if (batch.status !== ImportBatchStatus.PREVIEW) {
      throw new ConflictException(
        'Only successful preview batches can be applied.',
      );
    }

    const preview = this.previewPayloads.get(batchId);
    const persistedPayload = this.fromStoredImportPayload(batch.payloadJson);
    const previewPayload =
      preview && preview.ownerId === ownerId
        ? preview.payload
        : persistedPayload;
    if (
      !previewPayload ||
      (preview &&
        preview.ownerId === ownerId &&
        preview.expiresAt <= Date.now())
    ) {
      this.previewPayloads.delete(batchId);
      throw new ConflictException(
        'This import preview expired. Preview it again before applying.',
      );
    }

    try {
      const appliedBatch = await this.prisma.$transaction(async (tx) => {
        const analysis = await this.analyzePayload(tx, ownerId, previewPayload);

        if (!analysis.canApply) {
          throw new ConflictException(
            'This import batch is no longer valid. Preview it again before applying.',
          );
        }

        await this.applyPayload(tx, ownerId, previewPayload, analysis.state);

        return tx.importBatch.update({
          where: { id: batchId },
          data: {
            status: ImportBatchStatus.APPLIED,
            summaryJson: this.toJsonValue(analysis.summary),
            errorJson: this.toJsonValue(analysis.issues),
            payloadJson: Prisma.DbNull,
            appliedAt: new Date(),
          },
        });
      });

      if (
        previewPayload.recurringRules.length > 0 ||
        previewPayload.recurringExceptions.length > 0
      ) {
        try {
          await this.recurringService.materialize(ownerId);
        } catch (error) {
          this.logger.warn(
            `Import batch ${batchId} applied successfully, but recurring materialization failed: ${this.describeError(error)}`,
          );
        }
      }

      this.previewPayloads.delete(batchId);
      return this.toImportBatchResponse(appliedBatch);
    } catch (error) {
      if (error instanceof ConflictException) {
        const analysis = await this.analyzePayload(
          this.prisma,
          ownerId,
          previewPayload,
        );
        const failedBatch = await this.prisma.importBatch.update({
          where: { id: batchId },
          data: {
            status: ImportBatchStatus.FAILED,
            summaryJson: this.toJsonValue(analysis.summary),
            errorJson: this.toJsonValue(analysis.issues),
            payloadJson: Prisma.DbNull,
            appliedAt: null,
          },
        });

        void failedBatch;
      }

      this.previewPayloads.delete(batchId);
      throw error;
    }
  }

  async exportCsvZip(ownerId: string): Promise<ExportArchiveResult> {
    const state = await this.prisma.$transaction(async (tx) => {
      await this.backfillExportImportKeys(tx, ownerId);
      return this.loadExportState(tx, ownerId);
    });

    const files = this.buildExportFiles(state);
    return {
      filename: `finhance-export-${this.formatExportDate(new Date())}.zip`,
      buffer: this.buildZipArchive(files),
    };
  }

  private parseUploadedFiles(
    files: Partial<Record<ImportFileType, ImportUploadFile>>,
  ): { payload: ImportPayload; issues: ImportRowIssueResponse[] } {
    const payload: ImportPayload = {
      providedFiles: [],
      accounts: [],
      categories: [],
      assets: [],
      transactions: [],
      recurringRules: [],
      recurringExceptions: [],
      budgets: [],
      budgetOverrides: [],
    };
    const issues: ImportRowIssueResponse[] = [];

    for (const fileType of Object.keys(files) as ImportFileType[]) {
      const file = files[fileType];
      if (!file) {
        continue;
      }

      payload.providedFiles.push(fileType);

      if (file.buffer.length > MAX_UPLOAD_FILE_BYTES) {
        issues.push(
          this.issue(
            fileType,
            1,
            null,
            `${fileType}.csv exceeds the 1 MB size limit.`,
          ),
        );
        continue;
      }

      let records: Array<{ rowNumber: number; values: CsvRecord }>;
      try {
        records = this.parseCsvFile(fileType, file.buffer.toString('utf8'));
      } catch (error) {
        issues.push(this.issue(fileType, 1, null, this.describeError(error)));
        continue;
      }

      switch (fileType) {
        case 'accounts':
          payload.accounts = this.parseRows(
            fileType,
            records,
            issues,
            this.parseAccountRow.bind(this),
          );
          break;
        case 'categories':
          payload.categories = this.parseRows(
            fileType,
            records,
            issues,
            this.parseCategoryRow.bind(this),
          );
          break;
        case 'assets':
          payload.assets = this.parseRows(
            fileType,
            records,
            issues,
            this.parseAssetRow.bind(this),
          );
          break;
        case 'transactions':
          payload.transactions = this.parseRows(
            fileType,
            records,
            issues,
            this.parseTransactionRow.bind(this),
          );
          break;
        case 'recurringRules':
          payload.recurringRules = this.parseRows(
            fileType,
            records,
            issues,
            this.parseRecurringRuleRow.bind(this),
          );
          break;
        case 'recurringExceptions':
          payload.recurringExceptions = this.parseRows(
            fileType,
            records,
            issues,
            this.parseRecurringExceptionRow.bind(this),
          );
          break;
        case 'budgets':
          payload.budgets = this.parseRows(
            fileType,
            records,
            issues,
            this.parseBudgetRow.bind(this),
          );
          break;
        case 'budgetOverrides':
          payload.budgetOverrides = this.parseRows(
            fileType,
            records,
            issues,
            this.parseBudgetOverrideRow.bind(this),
          );
          break;
      }
    }

    if (payload.providedFiles.length === 0) {
      throw new BadRequestException('Upload at least one CSV file to preview.');
    }

    return { payload, issues };
  }

  private parseRows<T>(
    file: ImportFileType,
    records: Array<{ rowNumber: number; values: CsvRecord }>,
    issues: ImportRowIssueResponse[],
    parser: (rowNumber: number, values: CsvRecord) => T,
  ): T[] {
    const rows: T[] = [];

    for (const record of records) {
      try {
        rows.push(parser(record.rowNumber, record.values));
      } catch (error) {
        issues.push(
          this.issue(file, record.rowNumber, null, this.describeError(error)),
        );
      }
    }

    return rows;
  }

  private parseCsvFile(
    file: ImportFileType,
    rawText: string,
  ): Array<{ rowNumber: number; values: CsvRecord }> {
    const text = rawText.replace(/^\uFEFF/, '');
    const rows = this.parseCsvRows(text);

    if (rows.length === 0 || rows[0].every((cell) => cell.trim() === '')) {
      throw new BadRequestException(`${file}.csv is empty.`);
    }

    const headers = rows[0].map((value) => value.trim());
    const expectedHeaders = [...IMPORT_TEMPLATE_HEADERS[file]];
    const optionalHeaders =
      file === 'accounts' ? ['openingBalance', 'openingBalanceDate'] : [];
    const unknownHeaders = headers.filter(
      (header) => !expectedHeaders.includes(header),
    );
    const missingHeaders = expectedHeaders.filter(
      (header) =>
        !headers.includes(header) && !optionalHeaders.includes(header),
    );

    if (unknownHeaders.length > 0 || missingHeaders.length > 0) {
      const parts: string[] = [];

      if (unknownHeaders.length > 0) {
        parts.push(`Unknown headers: ${unknownHeaders.join(', ')}.`);
      }

      if (missingHeaders.length > 0) {
        parts.push(`Missing headers: ${missingHeaders.join(', ')}.`);
      }

      throw new BadRequestException(
        `${file}.csv does not match the finhance template. ${parts.join(' ')}`,
      );
    }

    const records: Array<{ rowNumber: number; values: CsvRecord }> = [];

    for (let index = 1; index < rows.length; index += 1) {
      const rawRow = rows[index];
      const values = rawRow.map((value) => value.trim());

      if (values.every((value) => value === '')) {
        continue;
      }

      if (rawRow.length > headers.length) {
        throw new BadRequestException(
          `${file}.csv row ${index + 1} has more columns than the header row.`,
        );
      }

      const record: CsvRecord = {};
      for (const header of headers) {
        record[header] = '';
      }

      for (
        let columnIndex = 0;
        columnIndex < headers.length;
        columnIndex += 1
      ) {
        record[headers[columnIndex]] = rawRow[columnIndex]?.trim() ?? '';
      }

      records.push({
        rowNumber: index + 1,
        values: record,
      });
    }

    return records;
  }

  private parseCsvRows(text: string): string[][] {
    const rows: string[][] = [];
    let currentRow: string[] = [];
    let currentField = '';
    let inQuotes = false;

    for (let index = 0; index < text.length; index += 1) {
      const character = text[index];
      const nextCharacter = text[index + 1];

      if (character === '"') {
        if (inQuotes && nextCharacter === '"') {
          currentField += '"';
          index += 1;
          continue;
        }

        inQuotes = !inQuotes;
        continue;
      }

      if (!inQuotes && character === ',') {
        currentRow.push(currentField);
        currentField = '';
        continue;
      }

      if (!inQuotes && (character === '\n' || character === '\r')) {
        if (character === '\r' && nextCharacter === '\n') {
          index += 1;
        }

        currentRow.push(currentField);
        rows.push(currentRow);
        currentRow = [];
        currentField = '';
        continue;
      }

      currentField += character;
    }

    if (inQuotes) {
      throw new BadRequestException(
        'CSV parsing failed because a quoted field was not closed.',
      );
    }

    currentRow.push(currentField);
    rows.push(currentRow);
    return rows;
  }

  private parseAccountRow(
    rowNumber: number,
    values: CsvRecord,
  ): AccountImportRow {
    const importKey = this.requiredText(
      values.importKey,
      'accounts',
      rowNumber,
      'importKey',
    );
    const name = this.requiredText(values.name, 'accounts', rowNumber, 'name');
    const type = this.parseEnumValue<AccountType>(
      values.type,
      Object.values(AccountType),
      'accounts',
      rowNumber,
      'type',
    );
    const currency = this.parseRequiredCurrency(values.currency);

    return {
      rowNumber,
      importKey,
      name,
      type,
      currency,
      institution: this.optionalText(values.institution),
      notes: this.optionalText(values.notes),
      order: this.optionalInteger(values.order),
      openingBalance: this.optionalSignedDecimal(values.openingBalance),
      openingBalanceDate: this.optionalDateOnlyString(
        values.openingBalanceDate,
        'accounts',
        rowNumber,
        'openingBalanceDate',
      ),
      archived: this.optionalBoolean(values.archived),
    };
  }

  private parseCategoryRow(
    rowNumber: number,
    values: CsvRecord,
  ): CategoryImportRow {
    return {
      rowNumber,
      importKey: this.requiredText(
        values.importKey,
        'categories',
        rowNumber,
        'importKey',
      ),
      name: this.requiredText(values.name, 'categories', rowNumber, 'name'),
      type: this.parseEnumValue<CategoryType>(
        values.type,
        Object.values(CategoryType),
        'categories',
        rowNumber,
        'type',
      ),
      order: this.optionalInteger(values.order),
      archived: this.optionalBoolean(values.archived),
    };
  }

  private parseAssetRow(rowNumber: number, values: CsvRecord): AssetImportRow {
    const type = this.parseEnumValue<AssetType>(
      values.type,
      Object.values(AssetType),
      'assets',
      rowNumber,
      'type',
    );
    const currency = this.parseRequiredCurrency(values.currency);
    const kind = values.kind
      ? this.parseEnumValue<AssetKind>(
          values.kind,
          Object.values(AssetKind),
          'assets',
          rowNumber,
          'kind',
        )
      : null;
    const liabilityKind = values.liabilityKind
      ? this.parseEnumValue<LiabilityKind>(
          values.liabilityKind,
          Object.values(LiabilityKind),
          'assets',
          rowNumber,
          'liabilityKind',
        )
      : null;
    const quantity = this.optionalDecimal(values.quantity);
    const unitPrice = this.optionalDecimal(values.unitPrice);
    let balance = this.optionalDecimal(values.balance);
    let ticker = this.optionalText(values.ticker);
    let exchange = this.optionalText(values.exchange)?.toUpperCase() ?? null;

    if (type === AssetType.LIABILITY) {
      if (!liabilityKind) {
        throw new BadRequestException(
          'assets.csv row must include liabilityKind for liabilities.',
        );
      }

      if (kind) {
        throw new BadRequestException(
          'assets.csv liability rows must leave kind empty.',
        );
      }

      if (!balance) {
        throw new BadRequestException(
          'assets.csv liability rows require balance.',
        );
      }

      if (ticker || exchange || quantity || unitPrice) {
        throw new BadRequestException(
          'assets.csv liability rows must not include ticker, exchange, quantity, or unitPrice.',
        );
      }
    } else {
      if (!kind) {
        throw new BadRequestException(
          'assets.csv asset rows must include kind.',
        );
      }

      if (liabilityKind) {
        throw new BadRequestException(
          'assets.csv asset rows must leave liabilityKind empty.',
        );
      }

      if (this.isMarketKind(kind)) {
        if (!quantity || !unitPrice) {
          throw new BadRequestException(
            'assets.csv market asset rows require quantity and unitPrice.',
          );
        }

        if (!ticker) {
          throw new BadRequestException(
            'assets.csv market asset rows require ticker.',
          );
        }

        exchange = this.normalizeAssetExchange(kind, exchange);
        ticker = this.normalizeAssetTicker(kind, ticker, currency);
        const computedBalance = new Prisma.Decimal(quantity).mul(
          new Prisma.Decimal(unitPrice),
        );

        if (balance && !computedBalance.eq(new Prisma.Decimal(balance))) {
          throw new BadRequestException(
            'assets.csv market asset balance must match quantity × unitPrice when provided.',
          );
        }

        balance = computedBalance.toString();
      } else {
        if (!balance) {
          throw new BadRequestException(
            'assets.csv non-market asset rows require balance.',
          );
        }

        if (ticker || exchange || quantity || unitPrice) {
          throw new BadRequestException(
            'assets.csv non-market asset rows must not include ticker, exchange, quantity, or unitPrice.',
          );
        }
      }
    }

    return {
      rowNumber,
      importKey: this.requiredText(
        values.importKey,
        'assets',
        rowNumber,
        'importKey',
      ),
      name: this.requiredText(values.name, 'assets', rowNumber, 'name'),
      type,
      kind,
      liabilityKind,
      currency,
      balance,
      accountImportKey: this.optionalText(values.accountImportKey),
      ticker,
      exchange,
      quantity,
      unitPrice,
      notes: this.optionalText(values.notes),
      order: this.optionalInteger(values.order),
    };
  }

  private parseTransactionRow(
    rowNumber: number,
    values: CsvRecord,
  ): TransactionImportRow {
    const kind = this.parseEnumValue<TransactionKind>(
      values.kind,
      Object.values(TransactionKind),
      'transactions',
      rowNumber,
      'kind',
    );
    const postedAt = this.parseDateString(
      values.postedAt,
      'transactions',
      rowNumber,
      'postedAt',
    );
    const amount = this.requiredDecimal(
      values.amount,
      'transactions',
      rowNumber,
      'amount',
    );
    const description = this.requiredText(
      values.description,
      'transactions',
      rowNumber,
      'description',
      MAX_DESCRIPTION_LENGTH,
    );
    const accountImportKey = this.optionalText(values.accountImportKey);
    const direction = values.direction
      ? this.parseEnumValue<TransactionDirection>(
          values.direction,
          Object.values(TransactionDirection),
          'transactions',
          rowNumber,
          'direction',
        )
      : null;
    const categoryImportKey = this.optionalText(values.categoryImportKey);
    const counterparty = this.optionalText(
      values.counterparty,
      MAX_COUNTERPARTY_LENGTH,
    );
    const sourceAccountImportKey = this.optionalText(
      values.sourceAccountImportKey,
    );
    const destinationAccountImportKey = this.optionalText(
      values.destinationAccountImportKey,
    );

    if (kind === TransactionKind.TRANSFER) {
      if (!sourceAccountImportKey || !destinationAccountImportKey) {
        throw new BadRequestException(
          'transactions.csv transfer rows require sourceAccountImportKey and destinationAccountImportKey.',
        );
      }

      if (sourceAccountImportKey === destinationAccountImportKey) {
        throw new BadRequestException(
          'transactions.csv transfer rows require two different account import keys.',
        );
      }

      if (accountImportKey || direction || categoryImportKey || counterparty) {
        throw new BadRequestException(
          'transactions.csv transfer rows must leave accountImportKey, direction, categoryImportKey, and counterparty empty.',
        );
      }
    } else {
      if (!accountImportKey) {
        throw new BadRequestException(
          'transactions.csv standard rows require accountImportKey.',
        );
      }

      if (sourceAccountImportKey || destinationAccountImportKey) {
        throw new BadRequestException(
          'transactions.csv non-transfer rows must leave sourceAccountImportKey and destinationAccountImportKey empty.',
        );
      }

      if (!direction) {
        throw new BadRequestException(
          'transactions.csv standard rows require direction.',
        );
      }

      if (
        kind === TransactionKind.EXPENSE &&
        direction !== TransactionDirection.OUTFLOW
      ) {
        throw new BadRequestException(
          'transactions.csv expense rows must use the OUTFLOW direction.',
        );
      }

      if (
        kind === TransactionKind.INCOME &&
        direction !== TransactionDirection.INFLOW
      ) {
        throw new BadRequestException(
          'transactions.csv income rows must use the INFLOW direction.',
        );
      }

      if (kind === TransactionKind.ADJUSTMENT && categoryImportKey) {
        throw new BadRequestException(
          'transactions.csv adjustment rows must leave categoryImportKey empty.',
        );
      }
    }

    return {
      rowNumber,
      importKey: this.requiredText(
        values.importKey,
        'transactions',
        rowNumber,
        'importKey',
      ),
      postedAt,
      kind,
      amount,
      description,
      notes: this.optionalText(values.notes),
      accountImportKey,
      direction,
      categoryImportKey,
      counterparty,
      sourceAccountImportKey,
      destinationAccountImportKey,
    };
  }

  private parseRecurringRuleRow(
    rowNumber: number,
    values: CsvRecord,
  ): RecurringRuleImportRow {
    const kind = this.parseEnumValue<TransactionKind>(
      values.kind,
      Object.values(TransactionKind),
      'recurringRules',
      rowNumber,
      'kind',
    );

    return {
      rowNumber,
      importKey: this.requiredText(
        values.importKey,
        'recurringRules',
        rowNumber,
        'importKey',
      ),
      name: this.requiredText(values.name, 'recurringRules', rowNumber, 'name'),
      isActive: this.optionalBoolean(values.isActive),
      kind,
      amount: this.requiredDecimal(
        values.amount,
        'recurringRules',
        rowNumber,
        'amount',
      ),
      dayOfMonth: this.requiredDayOfMonth(values.dayOfMonth),
      startDate: this.requiredDateOnlyString(
        values.startDate,
        'recurringRules',
        rowNumber,
        'startDate',
      ),
      endDate: this.optionalDateOnlyString(
        values.endDate,
        'recurringRules',
        rowNumber,
        'endDate',
      ),
      accountImportKey: this.optionalText(values.accountImportKey),
      direction: values.direction
        ? this.parseEnumValue<TransactionDirection>(
            values.direction,
            Object.values(TransactionDirection),
            'recurringRules',
            rowNumber,
            'direction',
          )
        : null,
      categoryImportKey: this.optionalText(values.categoryImportKey),
      counterparty: this.optionalText(
        values.counterparty,
        MAX_COUNTERPARTY_LENGTH,
      ),
      sourceAccountImportKey: this.optionalText(values.sourceAccountImportKey),
      destinationAccountImportKey: this.optionalText(
        values.destinationAccountImportKey,
      ),
      description: this.requiredText(
        values.description,
        'recurringRules',
        rowNumber,
        'description',
        MAX_DESCRIPTION_LENGTH,
      ),
      notes: this.optionalText(values.notes),
    };
  }

  private parseRecurringExceptionRow(
    rowNumber: number,
    values: CsvRecord,
  ): RecurringExceptionImportRow {
    return {
      rowNumber,
      recurringRuleImportKey: this.requiredText(
        values.recurringRuleImportKey,
        'recurringExceptions',
        rowNumber,
        'recurringRuleImportKey',
      ),
      month: this.requiredMonthKey(
        values.month,
        'recurringExceptions',
        rowNumber,
        'month',
      ),
      status: this.parseEnumValue<RecurringOccurrenceStatus>(
        values.status,
        Object.values(RecurringOccurrenceStatus),
        'recurringExceptions',
        rowNumber,
        'status',
      ),
      amount: this.optionalDecimal(values.amount),
      postedAtDate: this.optionalDateOnlyString(
        values.postedAtDate,
        'recurringExceptions',
        rowNumber,
        'postedAtDate',
      ),
      accountImportKey: this.optionalText(values.accountImportKey),
      direction: values.direction
        ? this.parseEnumValue<TransactionDirection>(
            values.direction,
            Object.values(TransactionDirection),
            'recurringExceptions',
            rowNumber,
            'direction',
          )
        : null,
      categoryImportKey: this.optionalText(values.categoryImportKey),
      counterparty: this.optionalText(
        values.counterparty,
        MAX_COUNTERPARTY_LENGTH,
      ),
      sourceAccountImportKey: this.optionalText(values.sourceAccountImportKey),
      destinationAccountImportKey: this.optionalText(
        values.destinationAccountImportKey,
      ),
      description: this.optionalText(
        values.description,
        MAX_DESCRIPTION_LENGTH,
      ),
      notes: this.optionalText(values.notes),
    };
  }

  private parseBudgetRow(
    rowNumber: number,
    values: CsvRecord,
  ): BudgetImportRow {
    return {
      rowNumber,
      importKey: this.requiredText(
        values.importKey,
        'budgets',
        rowNumber,
        'importKey',
      ),
      categoryImportKey: this.requiredText(
        values.categoryImportKey,
        'budgets',
        rowNumber,
        'categoryImportKey',
      ),
      currency: this.parseRequiredCurrency(values.currency),
      amount: this.requiredDecimal(
        values.amount,
        'budgets',
        rowNumber,
        'amount',
      ),
      startMonth: this.requiredMonthKey(
        values.startMonth,
        'budgets',
        rowNumber,
        'startMonth',
      ),
      endMonth: this.optionalMonthKey(
        values.endMonth,
        'budgets',
        rowNumber,
        'endMonth',
      ),
    };
  }

  private parseBudgetOverrideRow(
    rowNumber: number,
    values: CsvRecord,
  ): BudgetOverrideImportRow {
    return {
      rowNumber,
      budgetImportKey: this.requiredText(
        values.budgetImportKey,
        'budgetOverrides',
        rowNumber,
        'budgetImportKey',
      ),
      month: this.requiredMonthKey(
        values.month,
        'budgetOverrides',
        rowNumber,
        'month',
      ),
      amount: this.requiredDecimal(
        values.amount,
        'budgetOverrides',
        rowNumber,
        'amount',
      ),
      note: this.optionalText(values.note),
    };
  }

  private async analyzePayload(
    db: ImportDbClient,
    ownerId: string,
    payload: ImportPayload,
    initialIssues: ImportRowIssueResponse[] = [],
  ): Promise<ImportAnalysisResult> {
    const issues: ImportRowIssueResponse[] = [...initialIssues];
    const summary = this.createEmptySummary(payload.providedFiles);
    const duplicateRowKeys = this.collectDuplicateRowKeys(payload);

    for (const [file, rowKeys] of duplicateRowKeys.entries()) {
      for (const rowKey of rowKeys) {
        const rowNumber = Number(rowKey.split(':')[1]);
        issues.push(
          this.issue(
            file,
            rowNumber,
            'importKey',
            `Duplicate importKey in ${file}.csv.`,
          ),
        );
      }
    }

    const state = await this.loadExistingState(db, ownerId, payload);
    const stagedAccounts = this.buildStagedAccountRefs(
      payload,
      issues,
      duplicateRowKeys,
      state,
    );
    const stagedCategories = this.buildStagedCategoryRefs(
      payload,
      issues,
      duplicateRowKeys,
      state,
    );
    const stagedRecurringRules = this.buildStagedRecurringRuleRefs(
      payload,
      issues,
      duplicateRowKeys,
      state,
    );
    const stagedBudgets = this.buildStagedBudgetRefs(
      payload,
      issues,
      duplicateRowKeys,
      state,
    );

    this.validateCategories(payload, state, issues, duplicateRowKeys, summary);
    this.summarizeAccounts(payload, state, issues, duplicateRowKeys, summary);
    this.validateBudgets(
      payload,
      state,
      stagedCategories,
      issues,
      duplicateRowKeys,
      summary,
    );
    this.validateRecurringRules(
      payload,
      state,
      stagedAccounts,
      stagedCategories,
      issues,
      duplicateRowKeys,
      summary,
    );
    this.validateRecurringExceptions(
      payload,
      state,
      stagedAccounts,
      stagedCategories,
      stagedRecurringRules,
      issues,
      duplicateRowKeys,
      summary,
    );
    this.validateBudgetOverrides(
      payload,
      state,
      stagedBudgets,
      issues,
      duplicateRowKeys,
      summary,
    );
    this.validateAssets(
      payload,
      state,
      stagedAccounts,
      issues,
      duplicateRowKeys,
      summary,
    );
    this.validateTransactions(
      payload,
      state,
      stagedAccounts,
      stagedCategories,
      issues,
      duplicateRowKeys,
      summary,
    );

    issues.sort((left, right) => {
      if (left.file !== right.file) {
        return left.file.localeCompare(right.file);
      }

      if (left.rowNumber !== right.rowNumber) {
        return left.rowNumber - right.rowNumber;
      }

      return (left.field ?? '').localeCompare(right.field ?? '');
    });

    summary.errorCount = issues.filter(
      (issue) => issue.severity === 'ERROR',
    ).length;
    summary.warningCount = issues.filter(
      (issue) => issue.severity === 'WARNING',
    ).length;

    return {
      summary,
      issues,
      canApply: summary.errorCount === 0,
      state,
    };
  }

  private async loadExistingState(
    db: ImportDbClient,
    ownerId: string,
    payload: ImportPayload,
  ): Promise<ImportAnalysisState> {
    const marketKeyInputs: Array<{
      type: AssetType;
      kind: AssetKind;
      ticker: string;
      exchange: string;
    }> = [];

    for (const row of payload.accounts) {
      void row;
    }

    for (const row of payload.categories) {
      void row;
    }

    for (const row of payload.assets) {
      if (
        row.type === AssetType.ASSET &&
        row.kind &&
        this.isMarketKind(row.kind) &&
        row.ticker &&
        row.exchange !== null
      ) {
        marketKeyInputs.push({
          type: row.type,
          kind: row.kind,
          ticker: row.ticker,
          exchange: row.exchange,
        });
      }
    }

    for (const row of payload.transactions) {
      void row;
    }

    const [
      importedAccounts,
      importedCategories,
      importedAssets,
      importedTransactions,
      importedRecurringRules,
      importedBudgets,
      activeCategories,
      marketAssets,
    ] = await Promise.all([
      db.account.findMany({
        where: {
          userId: ownerId,
          importSource: CSV_IMPORT_SOURCE,
        },
      }),
      db.category.findMany({
        where: {
          userId: ownerId,
          importSource: CSV_IMPORT_SOURCE,
        },
      }),
      db.asset.findMany({
        where: {
          userId: ownerId,
          importSource: CSV_IMPORT_SOURCE,
        },
      }),
      db.transaction.findMany({
        where: {
          userId: ownerId,
          importSource: CSV_IMPORT_SOURCE,
        },
      }),
      db.recurringTransactionRule.findMany({
        where: {
          userId: ownerId,
          importSource: CSV_IMPORT_SOURCE,
        },
        include: {
          occurrences: true,
        },
      }),
      db.categoryBudget.findMany({
        where: {
          userId: ownerId,
          importSource: CSV_IMPORT_SOURCE,
        },
        include: {
          overrides: true,
        },
      }),
      db.category.findMany({
        where: {
          userId: ownerId,
          archivedAt: null,
        },
      }),
      marketKeyInputs.length === 0
        ? Promise.resolve([])
        : db.asset.findMany({
            where: {
              userId: ownerId,
              OR: marketKeyInputs.map((input) => ({
                type: input.type,
                kind: input.kind,
                ticker: input.ticker,
                exchange: input.exchange,
              })),
            },
          }),
    ]);

    const importedAccountsByKey = new Map<string, Account>();
    const importedCategoriesByKey = new Map<string, Category>();
    const importedAssetsByKey = new Map<string, Asset>();
    const importedTransactionsByKey = new Map<string, Transaction[]>();
    const importedRecurringRulesByKey = new Map<
      string,
      RecurringTransactionRule
    >();
    const importedRecurringExceptionsByRuleMonthKey = new Map<
      string,
      RecurringTransactionOccurrence
    >();
    const importedBudgetsByKey = new Map<string, CategoryBudget>();
    const importedBudgetOverridesByBudgetMonthKey = new Map<
      string,
      CategoryBudgetOverride
    >();
    const accountImportKeyById = new Map<string, string>();
    const categoryImportKeyById = new Map<string, string>();
    const marketAssetsByKey = new Map<string, Asset[]>();

    for (const account of importedAccounts) {
      if (account.importKey) {
        importedAccountsByKey.set(account.importKey, account);
        accountImportKeyById.set(account.id, account.importKey);
      }
    }

    for (const category of importedCategories) {
      if (category.importKey) {
        importedCategoriesByKey.set(category.importKey, category);
        categoryImportKeyById.set(category.id, category.importKey);
      }
    }

    for (const asset of importedAssets) {
      if (asset.importKey) {
        importedAssetsByKey.set(asset.importKey, asset);
      }
    }

    for (const row of importedTransactions) {
      if (!row.importKey) {
        continue;
      }

      const existing = importedTransactionsByKey.get(row.importKey) ?? [];
      existing.push(row);
      importedTransactionsByKey.set(row.importKey, existing);
    }

    for (const rule of importedRecurringRules) {
      if (!rule.importKey) {
        continue;
      }

      importedRecurringRulesByKey.set(rule.importKey, rule);

      for (const occurrence of rule.occurrences) {
        importedRecurringExceptionsByRuleMonthKey.set(
          `${rule.importKey}:${occurrence.occurrenceMonth.toISOString().slice(0, 7)}`,
          occurrence,
        );
      }
    }

    for (const budget of importedBudgets) {
      if (!budget.importKey) {
        continue;
      }

      importedBudgetsByKey.set(budget.importKey, budget);

      for (const override of budget.overrides) {
        importedBudgetOverridesByBudgetMonthKey.set(
          `${budget.importKey}:${override.month.toISOString().slice(0, 7)}`,
          override,
        );
      }
    }

    for (const asset of marketAssets) {
      if (!asset.kind || !asset.ticker || asset.exchange === null) {
        continue;
      }

      const key = this.marketAssetKey(asset.kind, asset.ticker, asset.exchange);
      const existing = marketAssetsByKey.get(key) ?? [];
      existing.push(asset);
      marketAssetsByKey.set(key, existing);
    }

    return {
      importedAccountsByKey,
      importedCategoriesByKey,
      importedAssetsByKey,
      importedTransactionsByKey,
      importedRecurringRulesByKey,
      importedRecurringExceptionsByRuleMonthKey,
      importedBudgetsByKey,
      importedBudgetOverridesByBudgetMonthKey,
      accountImportKeyById,
      categoryImportKeyById,
      activeCategories,
      marketAssetsByKey,
    };
  }

  private buildStagedAccountRefs(
    payload: ImportPayload,
    issues: ImportRowIssueResponse[],
    duplicateRowKeys: Map<ImportFileType, Set<string>>,
    state: ImportAnalysisState,
  ): Map<string, AccountImportRef> {
    const refs = new Map<string, AccountImportRef>();

    for (const [key, account] of state.importedAccountsByKey.entries()) {
      refs.set(key, {
        id: account.id,
        currency: account.currency,
        archived: account.archivedAt !== null,
        openingBalanceDate:
          account.openingBalanceDate?.toISOString().slice(0, 10) ?? null,
      });
    }

    for (const row of payload.accounts) {
      if (
        this.rowHasErrors('accounts', row.rowNumber, issues, duplicateRowKeys)
      ) {
        continue;
      }

      const existing = state.importedAccountsByKey.get(row.importKey);

      refs.set(row.importKey, {
        id: existing?.id ?? row.importKey,
        currency: row.currency,
        archived: row.archived,
        openingBalanceDate: row.openingBalanceDate,
      });
    }

    return refs;
  }

  private buildStagedCategoryRefs(
    payload: ImportPayload,
    issues: ImportRowIssueResponse[],
    duplicateRowKeys: Map<ImportFileType, Set<string>>,
    state: ImportAnalysisState,
  ): Map<string, CategoryImportRef> {
    const refs = new Map<string, CategoryImportRef>();

    for (const [key, category] of state.importedCategoriesByKey.entries()) {
      refs.set(key, {
        id: category.id,
        type: category.type,
        archived: category.archivedAt !== null,
      });
    }

    for (const row of payload.categories) {
      if (
        this.rowHasErrors('categories', row.rowNumber, issues, duplicateRowKeys)
      ) {
        continue;
      }

      const existing = state.importedCategoriesByKey.get(row.importKey);

      refs.set(row.importKey, {
        id: existing?.id ?? row.importKey,
        type: row.type,
        archived: row.archived,
      });
    }

    return refs;
  }

  private buildStagedRecurringRuleRefs(
    payload: ImportPayload,
    issues: ImportRowIssueResponse[],
    duplicateRowKeys: Map<ImportFileType, Set<string>>,
    state: ImportAnalysisState,
  ): Map<
    string,
    {
      kind: TransactionKind;
      dayOfMonth: number;
      startDate: string;
      endDate: string | null;
    }
  > {
    const refs = new Map<
      string,
      {
        kind: TransactionKind;
        dayOfMonth: number;
        startDate: string;
        endDate: string | null;
      }
    >();

    for (const [key, rule] of state.importedRecurringRulesByKey.entries()) {
      refs.set(key, {
        kind: rule.kind,
        dayOfMonth: rule.dayOfMonth,
        startDate: rule.startDate.toISOString().slice(0, 10),
        endDate: rule.endDate?.toISOString().slice(0, 10) ?? null,
      });
    }

    for (const row of payload.recurringRules) {
      if (
        this.rowHasErrors(
          'recurringRules',
          row.rowNumber,
          issues,
          duplicateRowKeys,
        )
      ) {
        continue;
      }

      refs.set(row.importKey, {
        kind: row.kind,
        dayOfMonth: row.dayOfMonth,
        startDate: row.startDate,
        endDate: row.endDate,
      });
    }

    return refs;
  }

  private buildStagedBudgetRefs(
    payload: ImportPayload,
    issues: ImportRowIssueResponse[],
    duplicateRowKeys: Map<ImportFileType, Set<string>>,
    state: ImportAnalysisState,
  ): Map<
    string,
    {
      categoryId: string;
      currency: string;
      startMonth: string;
      endMonth: string | null;
    }
  > {
    const refs = new Map<
      string,
      {
        categoryId: string;
        currency: string;
        startMonth: string;
        endMonth: string | null;
      }
    >();

    for (const [key, budget] of state.importedBudgetsByKey.entries()) {
      refs.set(key, {
        categoryId: budget.categoryId,
        currency: budget.currency,
        startMonth: budget.startMonth.toISOString().slice(0, 7),
        endMonth: budget.endMonth?.toISOString().slice(0, 7) ?? null,
      });
    }

    for (const row of payload.budgets) {
      if (
        this.rowHasErrors('budgets', row.rowNumber, issues, duplicateRowKeys)
      ) {
        continue;
      }

      refs.set(row.importKey, {
        categoryId: row.categoryImportKey,
        currency: row.currency,
        startMonth: row.startMonth,
        endMonth: row.endMonth,
      });
    }

    return refs;
  }

  private summarizeAccounts(
    payload: ImportPayload,
    state: ImportAnalysisState,
    issues: ImportRowIssueResponse[],
    duplicateRowKeys: Map<ImportFileType, Set<string>>,
    summary: ImportBatchSummaryResponse,
  ): void {
    for (const row of payload.accounts) {
      if (
        this.rowHasErrors('accounts', row.rowNumber, issues, duplicateRowKeys)
      ) {
        continue;
      }

      if (
        row.openingBalance !== null &&
        !new Prisma.Decimal(row.openingBalance).eq(ZERO) &&
        !row.openingBalanceDate
      ) {
        issues.push(
          this.issue(
            'accounts',
            row.rowNumber,
            'openingBalanceDate',
            'openingBalanceDate is required when openingBalance is not zero.',
          ),
        );
        continue;
      }

      const existing = state.importedAccountsByKey.get(row.importKey);
      const targetOrder = row.order ?? existing?.order ?? 0;
      const action = !existing
        ? 'createCount'
        : this.equalAccountRow(existing, row, targetOrder)
          ? 'unchangedCount'
          : 'updateCount';

      this.bumpSummary(summary, 'accounts', action);
    }
  }

  private validateCategories(
    payload: ImportPayload,
    state: ImportAnalysisState,
    issues: ImportRowIssueResponse[],
    duplicateRowKeys: Map<ImportFileType, Set<string>>,
    summary: ImportBatchSummaryResponse,
  ): void {
    const activeKeys = new Map<string, number>();

    for (const row of payload.categories) {
      if (
        this.rowHasErrors('categories', row.rowNumber, issues, duplicateRowKeys)
      ) {
        continue;
      }

      const existing = state.importedCategoriesByKey.get(row.importKey);
      const targetOrder = row.order ?? existing?.order ?? 0;
      const targetArchived = row.archived;
      const activeKey = `${row.type}:${row.name.toLowerCase()}`;

      if (!targetArchived) {
        const duplicateRow = activeKeys.get(activeKey);
        if (duplicateRow) {
          issues.push(
            this.issue(
              'categories',
              row.rowNumber,
              'name',
              `Another imported category row already uses the active name "${row.name}" for ${row.type}.`,
            ),
          );
        } else {
          activeKeys.set(activeKey, row.rowNumber);
        }

        const conflictingExisting = state.activeCategories.find((category) => {
          if (category.type !== row.type) {
            return false;
          }

          if (category.name.toLowerCase() !== row.name.toLowerCase()) {
            return false;
          }

          return !existing || category.id !== existing.id;
        });

        if (conflictingExisting) {
          issues.push(
            this.issue(
              'categories',
              row.rowNumber,
              'name',
              `An existing active category already uses the name "${row.name}" for ${row.type}.`,
            ),
          );
          continue;
        }
      }

      if (
        this.rowHasErrors('categories', row.rowNumber, issues, duplicateRowKeys)
      ) {
        continue;
      }

      const action = !existing
        ? 'createCount'
        : this.equalCategoryRow(existing, row, targetOrder)
          ? 'unchangedCount'
          : 'updateCount';
      this.bumpSummary(summary, 'categories', action);
    }
  }

  private validateAssets(
    payload: ImportPayload,
    state: ImportAnalysisState,
    accountRefs: Map<string, AccountImportRef>,
    issues: ImportRowIssueResponse[],
    duplicateRowKeys: Map<ImportFileType, Set<string>>,
    summary: ImportBatchSummaryResponse,
  ): void {
    const marketKeysInPayload = new Map<string, number>();

    for (const row of payload.assets) {
      if (
        this.rowHasErrors('assets', row.rowNumber, issues, duplicateRowKeys)
      ) {
        continue;
      }

      const existing = state.importedAssetsByKey.get(row.importKey);
      const targetOrder = row.order ?? existing?.order ?? 0;

      if (row.accountImportKey && !accountRefs.has(row.accountImportKey)) {
        issues.push(
          this.issue(
            'assets',
            row.rowNumber,
            'accountImportKey',
            `No imported account with key "${row.accountImportKey}" exists in this batch or current data.`,
          ),
        );
      }

      if (
        row.type === AssetType.ASSET &&
        row.kind &&
        this.isMarketKind(row.kind) &&
        row.ticker &&
        row.exchange !== null
      ) {
        const marketKey = this.marketAssetKey(
          row.kind,
          row.ticker,
          row.exchange,
        );
        const duplicateRow = marketKeysInPayload.get(marketKey);
        if (duplicateRow) {
          issues.push(
            this.issue(
              'assets',
              row.rowNumber,
              'ticker',
              'Another imported asset row already targets the same market position.',
            ),
          );
        } else {
          marketKeysInPayload.set(marketKey, row.rowNumber);
        }

        const conflictingExisting = (
          state.marketAssetsByKey.get(marketKey) ?? []
        ).find((asset) => !existing || asset.id !== existing.id);

        if (conflictingExisting) {
          issues.push(
            this.issue(
              'assets',
              row.rowNumber,
              'ticker',
              `An existing asset already owns the position ${row.ticker}${row.exchange}.`,
            ),
          );
        }
      }

      if (
        this.rowHasErrors('assets', row.rowNumber, issues, duplicateRowKeys)
      ) {
        continue;
      }

      const action = !existing
        ? 'createCount'
        : this.equalAssetRow(
              existing,
              row,
              targetOrder,
              state.accountImportKeyById,
            )
          ? 'unchangedCount'
          : 'updateCount';
      this.bumpSummary(summary, 'assets', action);
    }
  }

  private validateTransactions(
    payload: ImportPayload,
    state: ImportAnalysisState,
    accountRefs: Map<string, AccountImportRef>,
    categoryRefs: Map<string, CategoryImportRef>,
    issues: ImportRowIssueResponse[],
    duplicateRowKeys: Map<ImportFileType, Set<string>>,
    summary: ImportBatchSummaryResponse,
  ): void {
    for (const row of payload.transactions) {
      if (
        this.rowHasErrors(
          'transactions',
          row.rowNumber,
          issues,
          duplicateRowKeys,
        )
      ) {
        continue;
      }

      const existingRows =
        state.importedTransactionsByKey.get(row.importKey) ?? [];

      if (row.kind === TransactionKind.TRANSFER) {
        if (!row.sourceAccountImportKey || !row.destinationAccountImportKey) {
          continue;
        }

        const source = accountRefs.get(row.sourceAccountImportKey);
        const destination = accountRefs.get(row.destinationAccountImportKey);

        if (!source) {
          issues.push(
            this.issue(
              'transactions',
              row.rowNumber,
              'sourceAccountImportKey',
              `No imported account with key "${row.sourceAccountImportKey}" exists in this batch or current data.`,
            ),
          );
        }

        if (!destination) {
          issues.push(
            this.issue(
              'transactions',
              row.rowNumber,
              'destinationAccountImportKey',
              `No imported account with key "${row.destinationAccountImportKey}" exists in this batch or current data.`,
            ),
          );
        }

        if (source && destination && source.currency !== destination.currency) {
          issues.push(
            this.issue(
              'transactions',
              row.rowNumber,
              'destinationAccountImportKey',
              'Transfer imports require source and destination accounts with the same currency.',
            ),
          );
        }

        const postedAtDateKey = row.postedAt.slice(0, 10);
        if (
          source?.openingBalanceDate &&
          postedAtDateKey < source.openingBalanceDate
        ) {
          issues.push(
            this.issue(
              'transactions',
              row.rowNumber,
              'postedAt',
              `Transactions before ${source.openingBalanceDate} are not allowed for account ${row.sourceAccountImportKey}.`,
            ),
          );
        }

        if (
          destination?.openingBalanceDate &&
          postedAtDateKey < destination.openingBalanceDate
        ) {
          issues.push(
            this.issue(
              'transactions',
              row.rowNumber,
              'postedAt',
              `Transactions before ${destination.openingBalanceDate} are not allowed for account ${row.destinationAccountImportKey}.`,
            ),
          );
        }

        if (
          existingRows.length > 0 &&
          (existingRows.length !== 2 ||
            existingRows.some(
              (existing) => existing.kind !== TransactionKind.TRANSFER,
            ))
        ) {
          issues.push(
            this.issue(
              'transactions',
              row.rowNumber,
              'importKey',
              'This importKey already belongs to a non-transfer transaction.',
            ),
          );
        }

        if (
          this.rowHasErrors(
            'transactions',
            row.rowNumber,
            issues,
            duplicateRowKeys,
          )
        ) {
          continue;
        }

        const action =
          existingRows.length === 0
            ? 'createCount'
            : this.equalTransferRow(
                  existingRows,
                  row,
                  state.accountImportKeyById,
                )
              ? 'unchangedCount'
              : 'updateCount';
        this.bumpSummary(summary, 'transactions', action);
        continue;
      }

      if (!row.accountImportKey || !row.direction) {
        continue;
      }

      if (!accountRefs.has(row.accountImportKey)) {
        issues.push(
          this.issue(
            'transactions',
            row.rowNumber,
            'accountImportKey',
            `No imported account with key "${row.accountImportKey}" exists in this batch or current data.`,
          ),
        );
      }
      const account = accountRefs.get(row.accountImportKey);
      if (
        account?.openingBalanceDate &&
        row.postedAt.slice(0, 10) < account.openingBalanceDate
      ) {
        issues.push(
          this.issue(
            'transactions',
            row.rowNumber,
            'postedAt',
            `Transactions before ${account.openingBalanceDate} are not allowed for account ${row.accountImportKey}.`,
          ),
        );
      }

      if (row.categoryImportKey) {
        const category = categoryRefs.get(row.categoryImportKey);

        if (!category) {
          issues.push(
            this.issue(
              'transactions',
              row.rowNumber,
              'categoryImportKey',
              `No imported category with key "${row.categoryImportKey}" exists in this batch or current data.`,
            ),
          );
        } else if (
          (row.kind === TransactionKind.EXPENSE &&
            category.type !== CategoryType.EXPENSE) ||
          (row.kind === TransactionKind.INCOME &&
            category.type !== CategoryType.INCOME)
        ) {
          issues.push(
            this.issue(
              'transactions',
              row.rowNumber,
              'categoryImportKey',
              `Category ${row.categoryImportKey} does not match the ${row.kind} transaction type.`,
            ),
          );
        }
      }

      if (
        existingRows.length > 0 &&
        (existingRows.length !== 1 ||
          existingRows[0].kind === TransactionKind.TRANSFER)
      ) {
        issues.push(
          this.issue(
            'transactions',
            row.rowNumber,
            'importKey',
            'This importKey already belongs to a transfer transaction.',
          ),
        );
      }

      if (existingRows.length === 1 && existingRows[0].kind !== row.kind) {
        issues.push(
          this.issue(
            'transactions',
            row.rowNumber,
            'kind',
            'Imported transactions cannot change kind for an existing importKey.',
          ),
        );
      }

      if (
        this.rowHasErrors(
          'transactions',
          row.rowNumber,
          issues,
          duplicateRowKeys,
        )
      ) {
        continue;
      }

      const action =
        existingRows.length === 0
          ? 'createCount'
          : this.equalStandardTransactionRow(
                existingRows[0],
                row,
                state.accountImportKeyById,
                state.categoryImportKeyById,
              )
            ? 'unchangedCount'
            : 'updateCount';
      this.bumpSummary(summary, 'transactions', action);
    }
  }

  private validateBudgets(
    payload: ImportPayload,
    state: ImportAnalysisState,
    categoryRefs: Map<string, CategoryImportRef>,
    issues: ImportRowIssueResponse[],
    duplicateRowKeys: Map<ImportFileType, Set<string>>,
    summary: ImportBatchSummaryResponse,
  ): void {
    const rangesByCategoryCurrency = new Map<
      string,
      Array<{
        importKey: string;
        startMonth: string;
        endMonth: string | null;
      }>
    >();

    for (const [importKey, budget] of state.importedBudgetsByKey.entries()) {
      const key = `${budget.categoryId}:${budget.currency}`;
      const existing = rangesByCategoryCurrency.get(key) ?? [];
      existing.push({
        importKey,
        startMonth: budget.startMonth.toISOString().slice(0, 7),
        endMonth: budget.endMonth?.toISOString().slice(0, 7) ?? null,
      });
      rangesByCategoryCurrency.set(key, existing);
    }

    for (const row of payload.budgets) {
      if (
        this.rowHasErrors('budgets', row.rowNumber, issues, duplicateRowKeys)
      ) {
        continue;
      }

      const category = categoryRefs.get(row.categoryImportKey);
      if (!category) {
        issues.push(
          this.issue(
            'budgets',
            row.rowNumber,
            'categoryImportKey',
            `No imported category with key "${row.categoryImportKey}" exists in this batch or current data.`,
          ),
        );
      } else if (category.type !== CategoryType.EXPENSE) {
        issues.push(
          this.issue(
            'budgets',
            row.rowNumber,
            'categoryImportKey',
            'Budgets can only target EXPENSE categories.',
          ),
        );
      }

      if (row.endMonth && row.startMonth > row.endMonth) {
        issues.push(
          this.issue(
            'budgets',
            row.rowNumber,
            'endMonth',
            'endMonth must be on or after startMonth.',
          ),
        );
      }

      if (category) {
        const overlapKey = `${category.id}:${row.currency}`;
        const ranges = rangesByCategoryCurrency.get(overlapKey) ?? [];
        const conflicting = ranges.find(
          (entry) =>
            entry.importKey !== row.importKey &&
            this.monthRangesOverlap(
              row.startMonth,
              row.endMonth,
              entry.startMonth,
              entry.endMonth,
            ),
        );

        if (conflicting) {
          issues.push(
            this.issue(
              'budgets',
              row.rowNumber,
              'startMonth',
              'Another budget already covers this category, currency, and month range.',
            ),
          );
        }
      }

      if (
        this.rowHasErrors('budgets', row.rowNumber, issues, duplicateRowKeys)
      ) {
        continue;
      }

      if (category) {
        const overlapKey = `${category.id}:${row.currency}`;
        const ranges = rangesByCategoryCurrency.get(overlapKey) ?? [];
        ranges.push({
          importKey: row.importKey,
          startMonth: row.startMonth,
          endMonth: row.endMonth,
        });
        rangesByCategoryCurrency.set(overlapKey, ranges);
      }

      const existing = state.importedBudgetsByKey.get(row.importKey);
      const action = !existing
        ? 'createCount'
        : this.equalBudgetRow(existing, row, state.categoryImportKeyById)
          ? 'unchangedCount'
          : 'updateCount';
      this.bumpSummary(summary, 'budgets', action);
    }
  }

  private validateBudgetOverrides(
    payload: ImportPayload,
    state: ImportAnalysisState,
    budgetRefs: Map<
      string,
      {
        categoryId: string;
        currency: string;
        startMonth: string;
        endMonth: string | null;
      }
    >,
    issues: ImportRowIssueResponse[],
    duplicateRowKeys: Map<ImportFileType, Set<string>>,
    summary: ImportBatchSummaryResponse,
  ): void {
    for (const row of payload.budgetOverrides) {
      if (
        this.rowHasErrors(
          'budgetOverrides',
          row.rowNumber,
          issues,
          duplicateRowKeys,
        )
      ) {
        continue;
      }

      const budget = budgetRefs.get(row.budgetImportKey);
      if (!budget) {
        issues.push(
          this.issue(
            'budgetOverrides',
            row.rowNumber,
            'budgetImportKey',
            `No imported budget with key "${row.budgetImportKey}" exists in this batch or current data.`,
          ),
        );
      } else if (
        !this.monthIsWithinCoverage(
          row.month,
          budget.startMonth,
          budget.endMonth,
        )
      ) {
        issues.push(
          this.issue(
            'budgetOverrides',
            row.rowNumber,
            'month',
            'Budget override month must stay inside the parent budget range.',
          ),
        );
      }

      if (
        this.rowHasErrors(
          'budgetOverrides',
          row.rowNumber,
          issues,
          duplicateRowKeys,
        )
      ) {
        continue;
      }

      const existing =
        state.importedBudgetOverridesByBudgetMonthKey.get(
          `${row.budgetImportKey}:${row.month}`,
        ) ?? null;
      const action = !existing
        ? 'createCount'
        : this.equalBudgetOverrideRow(existing, row)
          ? 'unchangedCount'
          : 'updateCount';
      this.bumpSummary(summary, 'budgetOverrides', action);
    }
  }

  private validateRecurringRules(
    payload: ImportPayload,
    state: ImportAnalysisState,
    accountRefs: Map<string, AccountImportRef>,
    categoryRefs: Map<string, CategoryImportRef>,
    issues: ImportRowIssueResponse[],
    duplicateRowKeys: Map<ImportFileType, Set<string>>,
    summary: ImportBatchSummaryResponse,
  ): void {
    for (const row of payload.recurringRules) {
      if (
        this.rowHasErrors(
          'recurringRules',
          row.rowNumber,
          issues,
          duplicateRowKeys,
        )
      ) {
        continue;
      }

      if (row.endDate && row.endDate < row.startDate) {
        issues.push(
          this.issue(
            'recurringRules',
            row.rowNumber,
            'endDate',
            'endDate must be on or after startDate.',
          ),
        );
      }

      if (row.kind === TransactionKind.TRANSFER) {
        if (!row.sourceAccountImportKey || !row.destinationAccountImportKey) {
          issues.push(
            this.issue(
              'recurringRules',
              row.rowNumber,
              'sourceAccountImportKey',
              'Transfer recurring rules require sourceAccountImportKey and destinationAccountImportKey.',
            ),
          );
        }

        if (
          row.accountImportKey ||
          row.direction ||
          row.categoryImportKey ||
          row.counterparty
        ) {
          issues.push(
            this.issue(
              'recurringRules',
              row.rowNumber,
              'kind',
              'Transfer recurring rules must leave account, direction, category, and counterparty empty.',
            ),
          );
        }

        if (
          row.sourceAccountImportKey &&
          row.destinationAccountImportKey &&
          row.sourceAccountImportKey === row.destinationAccountImportKey
        ) {
          issues.push(
            this.issue(
              'recurringRules',
              row.rowNumber,
              'destinationAccountImportKey',
              'Transfers require two different accounts.',
            ),
          );
        }

        const source = row.sourceAccountImportKey
          ? accountRefs.get(row.sourceAccountImportKey)
          : null;
        const destination = row.destinationAccountImportKey
          ? accountRefs.get(row.destinationAccountImportKey)
          : null;

        if (row.sourceAccountImportKey && !source) {
          issues.push(
            this.issue(
              'recurringRules',
              row.rowNumber,
              'sourceAccountImportKey',
              `No imported account with key "${row.sourceAccountImportKey}" exists in this batch or current data.`,
            ),
          );
        }

        if (row.destinationAccountImportKey && !destination) {
          issues.push(
            this.issue(
              'recurringRules',
              row.rowNumber,
              'destinationAccountImportKey',
              `No imported account with key "${row.destinationAccountImportKey}" exists in this batch or current data.`,
            ),
          );
        }

        if (source && destination && source.currency !== destination.currency) {
          issues.push(
            this.issue(
              'recurringRules',
              row.rowNumber,
              'destinationAccountImportKey',
              'Transfer recurring rules require source and destination accounts with the same currency.',
            ),
          );
        }
      } else {
        if (!row.accountImportKey) {
          issues.push(
            this.issue(
              'recurringRules',
              row.rowNumber,
              'accountImportKey',
              'Standard recurring rules require accountImportKey.',
            ),
          );
        } else if (!accountRefs.has(row.accountImportKey)) {
          issues.push(
            this.issue(
              'recurringRules',
              row.rowNumber,
              'accountImportKey',
              `No imported account with key "${row.accountImportKey}" exists in this batch or current data.`,
            ),
          );
        }

        if (!row.direction) {
          issues.push(
            this.issue(
              'recurringRules',
              row.rowNumber,
              'direction',
              'Standard recurring rules require direction.',
            ),
          );
        }

        if (
          row.kind === TransactionKind.EXPENSE &&
          row.direction !== TransactionDirection.OUTFLOW
        ) {
          issues.push(
            this.issue(
              'recurringRules',
              row.rowNumber,
              'direction',
              'Expense recurring rules must use the OUTFLOW direction.',
            ),
          );
        }

        if (
          row.kind === TransactionKind.INCOME &&
          row.direction !== TransactionDirection.INFLOW
        ) {
          issues.push(
            this.issue(
              'recurringRules',
              row.rowNumber,
              'direction',
              'Income recurring rules must use the INFLOW direction.',
            ),
          );
        }

        if (row.kind === TransactionKind.ADJUSTMENT && row.categoryImportKey) {
          issues.push(
            this.issue(
              'recurringRules',
              row.rowNumber,
              'categoryImportKey',
              'Adjustment recurring rules cannot be assigned to categories.',
            ),
          );
        }

        if (row.categoryImportKey) {
          const category = categoryRefs.get(row.categoryImportKey);
          if (!category) {
            issues.push(
              this.issue(
                'recurringRules',
                row.rowNumber,
                'categoryImportKey',
                `No imported category with key "${row.categoryImportKey}" exists in this batch or current data.`,
              ),
            );
          } else if (
            (row.kind === TransactionKind.EXPENSE &&
              category.type !== CategoryType.EXPENSE) ||
            (row.kind === TransactionKind.INCOME &&
              category.type !== CategoryType.INCOME)
          ) {
            issues.push(
              this.issue(
                'recurringRules',
                row.rowNumber,
                'categoryImportKey',
                `Category ${row.categoryImportKey} does not match the ${row.kind} recurring rule type.`,
              ),
            );
          }
        }
      }

      const accountsToCheck = [
        row.accountImportKey,
        row.sourceAccountImportKey,
        row.destinationAccountImportKey,
      ].filter(Boolean) as string[];
      for (const accountImportKey of accountsToCheck) {
        const account = accountRefs.get(accountImportKey);
        if (
          account &&
          !this.ruleStartRespectsAccountBaseline(
            row.startDate,
            row.dayOfMonth,
            account,
          )
        ) {
          issues.push(
            this.issue(
              'recurringRules',
              row.rowNumber,
              'startDate',
              `Recurring rules for ${accountImportKey} cannot create occurrences before that account's opening-balance cutoff.`,
            ),
          );
          break;
        }
      }

      if (
        this.rowHasErrors(
          'recurringRules',
          row.rowNumber,
          issues,
          duplicateRowKeys,
        )
      ) {
        continue;
      }

      const existing = state.importedRecurringRulesByKey.get(row.importKey);
      const action = !existing
        ? 'createCount'
        : this.equalRecurringRuleRow(
              existing,
              row,
              state.accountImportKeyById,
              state.categoryImportKeyById,
            )
          ? 'unchangedCount'
          : 'updateCount';
      this.bumpSummary(summary, 'recurringRules', action);
    }
  }

  private validateRecurringExceptions(
    payload: ImportPayload,
    state: ImportAnalysisState,
    accountRefs: Map<string, AccountImportRef>,
    categoryRefs: Map<string, CategoryImportRef>,
    recurringRuleRefs: Map<
      string,
      {
        kind: TransactionKind;
        dayOfMonth: number;
        startDate: string;
        endDate: string | null;
      }
    >,
    issues: ImportRowIssueResponse[],
    duplicateRowKeys: Map<ImportFileType, Set<string>>,
    summary: ImportBatchSummaryResponse,
  ): void {
    for (const row of payload.recurringExceptions) {
      if (
        this.rowHasErrors(
          'recurringExceptions',
          row.rowNumber,
          issues,
          duplicateRowKeys,
        )
      ) {
        continue;
      }

      const rule = recurringRuleRefs.get(row.recurringRuleImportKey);
      if (!rule) {
        issues.push(
          this.issue(
            'recurringExceptions',
            row.rowNumber,
            'recurringRuleImportKey',
            `No imported recurring rule with key "${row.recurringRuleImportKey}" exists in this batch or current data.`,
          ),
        );
      } else if (
        !this.recurringRuleAppliesToMonth(
          rule.startDate,
          rule.endDate,
          rule.dayOfMonth,
          row.month,
        )
      ) {
        issues.push(
          this.issue(
            'recurringExceptions',
            row.rowNumber,
            'month',
            'This recurring rule does not apply to the selected month.',
          ),
        );
      }

      if (row.status === RecurringOccurrenceStatus.OVERRIDDEN) {
        if (!row.amount) {
          issues.push(
            this.issue(
              'recurringExceptions',
              row.rowNumber,
              'amount',
              'Override rows require amount.',
            ),
          );
        }

        if (!row.postedAtDate) {
          issues.push(
            this.issue(
              'recurringExceptions',
              row.rowNumber,
              'postedAtDate',
              'Override rows require postedAtDate.',
            ),
          );
        } else if (row.postedAtDate.slice(0, 7) !== row.month) {
          issues.push(
            this.issue(
              'recurringExceptions',
              row.rowNumber,
              'postedAtDate',
              'postedAtDate must stay inside the selected occurrence month.',
            ),
          );
        }

        if (!row.description) {
          issues.push(
            this.issue(
              'recurringExceptions',
              row.rowNumber,
              'description',
              'Override rows require description.',
            ),
          );
        }

        if (rule?.kind === TransactionKind.TRANSFER) {
          const source = row.sourceAccountImportKey
            ? accountRefs.get(row.sourceAccountImportKey)
            : null;
          const destination = row.destinationAccountImportKey
            ? accountRefs.get(row.destinationAccountImportKey)
            : null;

          if (!row.sourceAccountImportKey || !row.destinationAccountImportKey) {
            issues.push(
              this.issue(
                'recurringExceptions',
                row.rowNumber,
                'sourceAccountImportKey',
                'Transfer overrides require sourceAccountImportKey and destinationAccountImportKey.',
              ),
            );
          }

          if (
            row.sourceAccountImportKey &&
            row.destinationAccountImportKey &&
            row.sourceAccountImportKey === row.destinationAccountImportKey
          ) {
            issues.push(
              this.issue(
                'recurringExceptions',
                row.rowNumber,
                'destinationAccountImportKey',
                'Transfers require two different accounts.',
              ),
            );
          }

          if (
            row.accountImportKey ||
            row.direction ||
            row.categoryImportKey ||
            row.counterparty
          ) {
            issues.push(
              this.issue(
                'recurringExceptions',
                row.rowNumber,
                'status',
                'Transfer overrides must leave standard transaction fields empty.',
              ),
            );
          }

          if (row.sourceAccountImportKey && !source) {
            issues.push(
              this.issue(
                'recurringExceptions',
                row.rowNumber,
                'sourceAccountImportKey',
                `No imported account with key "${row.sourceAccountImportKey}" exists in this batch or current data.`,
              ),
            );
          }

          if (row.destinationAccountImportKey && !destination) {
            issues.push(
              this.issue(
                'recurringExceptions',
                row.rowNumber,
                'destinationAccountImportKey',
                `No imported account with key "${row.destinationAccountImportKey}" exists in this batch or current data.`,
              ),
            );
          }

          if (
            source &&
            destination &&
            source.currency !== destination.currency
          ) {
            issues.push(
              this.issue(
                'recurringExceptions',
                row.rowNumber,
                'destinationAccountImportKey',
                'Transfer overrides require source and destination accounts with the same currency.',
              ),
            );
          }

          if (
            row.postedAtDate &&
            source?.openingBalanceDate &&
            row.postedAtDate < source.openingBalanceDate
          ) {
            issues.push(
              this.issue(
                'recurringExceptions',
                row.rowNumber,
                'postedAtDate',
                `Recurring occurrences for ${row.sourceAccountImportKey} cannot be dated before ${source.openingBalanceDate}.`,
              ),
            );
          }

          if (
            row.postedAtDate &&
            destination?.openingBalanceDate &&
            row.postedAtDate < destination.openingBalanceDate
          ) {
            issues.push(
              this.issue(
                'recurringExceptions',
                row.rowNumber,
                'postedAtDate',
                `Recurring occurrences for ${row.destinationAccountImportKey} cannot be dated before ${destination.openingBalanceDate}.`,
              ),
            );
          }
        } else {
          if (!row.accountImportKey) {
            issues.push(
              this.issue(
                'recurringExceptions',
                row.rowNumber,
                'accountImportKey',
                'Standard overrides require accountImportKey.',
              ),
            );
          } else if (!accountRefs.has(row.accountImportKey)) {
            issues.push(
              this.issue(
                'recurringExceptions',
                row.rowNumber,
                'accountImportKey',
                `No imported account with key "${row.accountImportKey}" exists in this batch or current data.`,
              ),
            );
          }

          if (!row.direction) {
            issues.push(
              this.issue(
                'recurringExceptions',
                row.rowNumber,
                'direction',
                'Standard overrides require direction.',
              ),
            );
          }

          if (
            rule?.kind === TransactionKind.EXPENSE &&
            row.direction !== TransactionDirection.OUTFLOW
          ) {
            issues.push(
              this.issue(
                'recurringExceptions',
                row.rowNumber,
                'direction',
                'Expense recurring overrides must use the OUTFLOW direction.',
              ),
            );
          }

          if (
            rule?.kind === TransactionKind.INCOME &&
            row.direction !== TransactionDirection.INFLOW
          ) {
            issues.push(
              this.issue(
                'recurringExceptions',
                row.rowNumber,
                'direction',
                'Income recurring overrides must use the INFLOW direction.',
              ),
            );
          }

          if (
            rule?.kind === TransactionKind.ADJUSTMENT &&
            row.categoryImportKey
          ) {
            issues.push(
              this.issue(
                'recurringExceptions',
                row.rowNumber,
                'categoryImportKey',
                'Adjustment recurring overrides cannot be assigned to categories.',
              ),
            );
          }

          if (row.categoryImportKey) {
            const category = categoryRefs.get(row.categoryImportKey);
            if (!category) {
              issues.push(
                this.issue(
                  'recurringExceptions',
                  row.rowNumber,
                  'categoryImportKey',
                  `No imported category with key "${row.categoryImportKey}" exists in this batch or current data.`,
                ),
              );
            } else if (
              (rule?.kind === TransactionKind.EXPENSE &&
                category.type !== CategoryType.EXPENSE) ||
              (rule?.kind === TransactionKind.INCOME &&
                category.type !== CategoryType.INCOME)
            ) {
              issues.push(
                this.issue(
                  'recurringExceptions',
                  row.rowNumber,
                  'categoryImportKey',
                  `Category ${row.categoryImportKey} does not match the recurring rule type.`,
                ),
              );
            }
          }

          if (
            row.postedAtDate &&
            row.accountImportKey &&
            accountRefs.get(row.accountImportKey)?.openingBalanceDate &&
            row.postedAtDate <
              (accountRefs.get(row.accountImportKey)?.openingBalanceDate ?? '')
          ) {
            issues.push(
              this.issue(
                'recurringExceptions',
                row.rowNumber,
                'postedAtDate',
                `Recurring occurrences for ${row.accountImportKey} cannot be dated before ${accountRefs.get(row.accountImportKey)?.openingBalanceDate}.`,
              ),
            );
          }
        }
      }

      if (
        this.rowHasErrors(
          'recurringExceptions',
          row.rowNumber,
          issues,
          duplicateRowKeys,
        )
      ) {
        continue;
      }

      const existing =
        state.importedRecurringExceptionsByRuleMonthKey.get(
          `${row.recurringRuleImportKey}:${row.month}`,
        ) ?? null;
      const action = !existing
        ? 'createCount'
        : this.equalRecurringExceptionRow(
              existing,
              row,
              state.accountImportKeyById,
              state.categoryImportKeyById,
            )
          ? 'unchangedCount'
          : 'updateCount';
      this.bumpSummary(summary, 'recurringExceptions', action);
    }
  }

  private async applyPayload(
    db: ImportDbClient,
    ownerId: string,
    payload: ImportPayload,
    state: ImportAnalysisState,
  ): Promise<void> {
    const accountRefs = new Map<string, AccountImportRef>();
    const categoryRefs = new Map<string, CategoryImportRef>();
    const budgetRefs = new Map<string, BudgetImportRef>();
    const recurringRuleRefs = new Map<string, RecurringRuleImportRef>();

    for (const [key, account] of state.importedAccountsByKey.entries()) {
      accountRefs.set(key, {
        id: account.id,
        currency: account.currency,
        archived: account.archivedAt !== null,
        openingBalanceDate:
          account.openingBalanceDate?.toISOString().slice(0, 10) ?? null,
      });
    }

    for (const [key, category] of state.importedCategoriesByKey.entries()) {
      categoryRefs.set(key, {
        id: category.id,
        type: category.type,
        archived: category.archivedAt !== null,
      });
    }

    for (const [key, budget] of state.importedBudgetsByKey.entries()) {
      budgetRefs.set(key, { id: budget.id });
    }

    for (const [key, rule] of state.importedRecurringRulesByKey.entries()) {
      recurringRuleRefs.set(key, {
        id: rule.id,
        kind: rule.kind,
      });
    }

    for (const row of payload.accounts) {
      const existing = state.importedAccountsByKey.get(row.importKey);
      const targetOrder = row.order ?? existing?.order ?? 0;

      const saved = existing
        ? await db.account.update({
            where: { id: existing.id },
            data: {
              name: row.name,
              type: row.type,
              currency: row.currency,
              institution: row.institution,
              notes: row.notes,
              order: targetOrder,
              openingBalance: row.openingBalance
                ? new Prisma.Decimal(row.openingBalance)
                : ZERO,
              openingBalanceDate: row.openingBalanceDate
                ? new Date(`${row.openingBalanceDate}T00:00:00.000Z`)
                : null,
              archivedAt: row.archived ? new Date() : null,
              importSource: CSV_IMPORT_SOURCE,
              importKey: row.importKey,
            },
          })
        : await db.account.create({
            data: {
              userId: ownerId,
              name: row.name,
              type: row.type,
              currency: row.currency,
              institution: row.institution,
              notes: row.notes,
              order: targetOrder,
              openingBalance: row.openingBalance
                ? new Prisma.Decimal(row.openingBalance)
                : ZERO,
              openingBalanceDate: row.openingBalanceDate
                ? new Date(`${row.openingBalanceDate}T00:00:00.000Z`)
                : null,
              archivedAt: row.archived ? new Date() : null,
              importSource: CSV_IMPORT_SOURCE,
              importKey: row.importKey,
            },
          });

      accountRefs.set(row.importKey, {
        id: saved.id,
        currency: saved.currency,
        archived: saved.archivedAt !== null,
        openingBalanceDate:
          saved.openingBalanceDate?.toISOString().slice(0, 10) ?? null,
      });
    }

    for (const row of payload.categories) {
      const existing = state.importedCategoriesByKey.get(row.importKey);
      const targetOrder = row.order ?? existing?.order ?? 0;

      const saved = existing
        ? await db.category.update({
            where: { id: existing.id },
            data: {
              name: row.name,
              type: row.type,
              order: targetOrder,
              archivedAt: row.archived ? new Date() : null,
              importSource: CSV_IMPORT_SOURCE,
              importKey: row.importKey,
            },
          })
        : await db.category.create({
            data: {
              userId: ownerId,
              name: row.name,
              type: row.type,
              order: targetOrder,
              archivedAt: row.archived ? new Date() : null,
              importSource: CSV_IMPORT_SOURCE,
              importKey: row.importKey,
            },
          });

      categoryRefs.set(row.importKey, {
        id: saved.id,
        type: saved.type,
        archived: saved.archivedAt !== null,
      });
    }

    for (const row of payload.budgets) {
      const existing = state.importedBudgetsByKey.get(row.importKey);
      const categoryId = categoryRefs.get(row.categoryImportKey)?.id;

      if (!categoryId) {
        throw new ConflictException(
          `Budget import ${row.importKey} could not resolve its category.`,
        );
      }

      const data = {
        userId: ownerId,
        categoryId,
        currency: row.currency,
        amount: new Prisma.Decimal(row.amount),
        startMonth: new Date(`${row.startMonth}-01T00:00:00.000Z`),
        endMonth: row.endMonth
          ? new Date(`${row.endMonth}-01T00:00:00.000Z`)
          : null,
        importSource: CSV_IMPORT_SOURCE,
        importKey: row.importKey,
      };

      const saved = existing
        ? await db.categoryBudget.update({
            where: { id: existing.id },
            data,
          })
        : await db.categoryBudget.create({
            data,
          });

      budgetRefs.set(row.importKey, { id: saved.id });
    }

    for (const row of payload.budgetOverrides) {
      const budgetId = budgetRefs.get(row.budgetImportKey)?.id;

      if (!budgetId) {
        throw new ConflictException(
          `Budget override import ${row.budgetImportKey} could not resolve its budget.`,
        );
      }

      await db.categoryBudgetOverride.upsert({
        where: {
          categoryBudgetId_month: {
            categoryBudgetId: budgetId,
            month: new Date(`${row.month}-01T00:00:00.000Z`),
          },
        },
        create: {
          userId: ownerId,
          categoryBudgetId: budgetId,
          month: new Date(`${row.month}-01T00:00:00.000Z`),
          amount: new Prisma.Decimal(row.amount),
          note: row.note,
        },
        update: {
          amount: new Prisma.Decimal(row.amount),
          note: row.note,
        },
      });
    }

    for (const row of payload.recurringRules) {
      const existing = state.importedRecurringRulesByKey.get(row.importKey);
      const accountId = row.accountImportKey
        ? (accountRefs.get(row.accountImportKey)?.id ?? null)
        : null;
      const categoryId = row.categoryImportKey
        ? (categoryRefs.get(row.categoryImportKey)?.id ?? null)
        : null;
      const sourceAccountId = row.sourceAccountImportKey
        ? (accountRefs.get(row.sourceAccountImportKey)?.id ?? null)
        : null;
      const destinationAccountId = row.destinationAccountImportKey
        ? (accountRefs.get(row.destinationAccountImportKey)?.id ?? null)
        : null;

      const data = {
        userId: ownerId,
        importSource: CSV_IMPORT_SOURCE,
        importKey: row.importKey,
        name: row.name,
        isActive: row.isActive,
        kind: row.kind,
        amount: new Prisma.Decimal(row.amount),
        dayOfMonth: row.dayOfMonth,
        startDate: new Date(`${row.startDate}T00:00:00.000Z`),
        endDate: row.endDate ? new Date(`${row.endDate}T00:00:00.000Z`) : null,
        accountId,
        direction: row.direction,
        categoryId,
        counterparty: row.counterparty,
        sourceAccountId,
        destinationAccountId,
        description: row.description,
        notes: row.notes,
        lastMaterializationError: null,
        lastMaterializationErrorAt: null,
      };

      const saved = existing
        ? await db.recurringTransactionRule.update({
            where: { id: existing.id },
            data,
          })
        : await db.recurringTransactionRule.create({
            data,
          });

      recurringRuleRefs.set(row.importKey, {
        id: saved.id,
        kind: saved.kind,
      });
    }

    for (const row of payload.recurringExceptions) {
      const recurringRule = recurringRuleRefs.get(row.recurringRuleImportKey);

      if (!recurringRule) {
        throw new ConflictException(
          `Recurring exception import ${row.recurringRuleImportKey} could not resolve its recurring rule.`,
        );
      }

      const occurrenceMonth = new Date(`${row.month}-01T00:00:00.000Z`);
      const accountId = row.accountImportKey
        ? (accountRefs.get(row.accountImportKey)?.id ?? null)
        : null;
      const categoryId = row.categoryImportKey
        ? (categoryRefs.get(row.categoryImportKey)?.id ?? null)
        : null;
      const sourceAccountId = row.sourceAccountImportKey
        ? (accountRefs.get(row.sourceAccountImportKey)?.id ?? null)
        : null;
      const destinationAccountId = row.destinationAccountImportKey
        ? (accountRefs.get(row.destinationAccountImportKey)?.id ?? null)
        : null;
      const normalizedOverride = this.normalizeRecurringExceptionOverride(row);

      await db.recurringTransactionOccurrence.upsert({
        where: {
          recurringRuleId_occurrenceMonth: {
            recurringRuleId: recurringRule.id,
            occurrenceMonth,
          },
        },
        create: {
          userId: ownerId,
          recurringRuleId: recurringRule.id,
          occurrenceMonth,
          status: row.status,
          overrideAmount: normalizedOverride.amount
            ? new Prisma.Decimal(normalizedOverride.amount)
            : null,
          overridePostedAtDate: normalizedOverride.postedAtDate
            ? new Date(`${normalizedOverride.postedAtDate}T00:00:00.000Z`)
            : null,
          overrideAccountId: normalizedOverride.accountImportKey
            ? accountId
            : null,
          overrideDirection: normalizedOverride.direction,
          overrideCategoryId: normalizedOverride.categoryImportKey
            ? categoryId
            : null,
          overrideCounterparty: normalizedOverride.counterparty,
          overrideSourceAccountId: normalizedOverride.sourceAccountImportKey
            ? sourceAccountId
            : null,
          overrideDestinationAccountId:
            normalizedOverride.destinationAccountImportKey
              ? destinationAccountId
              : null,
          overrideDescription: normalizedOverride.description,
          overrideNotes: normalizedOverride.notes,
        },
        update: {
          status: row.status,
          overrideAmount: normalizedOverride.amount
            ? new Prisma.Decimal(normalizedOverride.amount)
            : null,
          overridePostedAtDate: normalizedOverride.postedAtDate
            ? new Date(`${normalizedOverride.postedAtDate}T00:00:00.000Z`)
            : null,
          overrideAccountId: normalizedOverride.accountImportKey
            ? accountId
            : null,
          overrideDirection: normalizedOverride.direction,
          overrideCategoryId: normalizedOverride.categoryImportKey
            ? categoryId
            : null,
          overrideCounterparty: normalizedOverride.counterparty,
          overrideSourceAccountId: normalizedOverride.sourceAccountImportKey
            ? sourceAccountId
            : null,
          overrideDestinationAccountId:
            normalizedOverride.destinationAccountImportKey
              ? destinationAccountId
              : null,
          overrideDescription: normalizedOverride.description,
          overrideNotes: normalizedOverride.notes,
        },
      });
    }

    for (const row of payload.assets) {
      const existing = state.importedAssetsByKey.get(row.importKey);
      const accountId = row.accountImportKey
        ? (accountRefs.get(row.accountImportKey)?.id ?? null)
        : null;
      const shouldClearQuote =
        !existing ||
        !this.isExistingMarketAsset(existing) ||
        existing.kind !== row.kind ||
        existing.ticker !== row.ticker ||
        existing.exchange !== row.exchange;
      const shouldClearFx = !existing || existing.currency !== row.currency;
      const balance = row.balance ? new Prisma.Decimal(row.balance) : ZERO;
      const quantity = row.quantity ? new Prisma.Decimal(row.quantity) : null;
      const unitPrice = row.unitPrice
        ? new Prisma.Decimal(row.unitPrice)
        : null;
      const targetOrder = row.order ?? existing?.order ?? 0;

      const data: Prisma.AssetUncheckedCreateInput = {
        userId: ownerId,
        accountId,
        name: row.name,
        type: row.type,
        kind: row.kind,
        liabilityKind: row.liabilityKind,
        ticker: row.ticker,
        exchange: row.exchange,
        quantity,
        unitPrice,
        balance,
        currency: row.currency,
        notes: row.notes,
        order: targetOrder,
        importSource: CSV_IMPORT_SOURCE,
        importKey: row.importKey,
      };

      if (existing) {
        await db.asset.update({
          where: { id: existing.id },
          data: {
            ...data,
            ...(shouldClearQuote
              ? {
                  lastPrice: null,
                  lastPriceAt: null,
                }
              : {}),
            ...(shouldClearFx || row.currency === 'EUR'
              ? {
                  lastFxRate: null,
                  lastFxRateAt: null,
                }
              : {}),
          },
        });
      } else {
        await db.asset.create({
          data: {
            ...data,
            lastPrice: null,
            lastPriceAt: null,
            lastFxRate: row.currency === 'EUR' ? null : undefined,
            lastFxRateAt: row.currency === 'EUR' ? null : undefined,
          },
        });
      }
    }

    for (const row of payload.transactions) {
      const existingRows =
        state.importedTransactionsByKey.get(row.importKey) ?? [];

      if (row.kind === TransactionKind.TRANSFER) {
        const sourceAccountId =
          accountRefs.get(row.sourceAccountImportKey!)?.id ?? null;
        const destinationAccountId =
          accountRefs.get(row.destinationAccountImportKey!)?.id ?? null;
        const currency =
          accountRefs.get(row.sourceAccountImportKey!)?.currency ?? 'EUR';

        if (!sourceAccountId || !destinationAccountId) {
          throw new ConflictException(
            `Transfer import ${row.importKey} could not resolve its accounts.`,
          );
        }

        const postedAt = new Date(row.postedAt);
        const amount = new Prisma.Decimal(row.amount);
        const transferGroupId =
          existingRows.find((existing) => existing.transferGroupId)
            ?.transferGroupId ?? `transfer_${randomUUID()}`;

        if (existingRows.length === 2) {
          const outflow = existingRows.find(
            (existing) => existing.direction === TransactionDirection.OUTFLOW,
          );
          const inflow = existingRows.find(
            (existing) => existing.direction === TransactionDirection.INFLOW,
          );

          if (!outflow || !inflow) {
            throw new ConflictException(
              `Transfer import ${row.importKey} is incomplete in storage.`,
            );
          }

          await db.transaction.update({
            where: { id: outflow.id },
            data: {
              postedAt,
              accountId: sourceAccountId,
              amount,
              currency,
              description: row.description,
              notes: row.notes,
              counterparty: null,
              categoryId: null,
              kind: TransactionKind.TRANSFER,
              direction: TransactionDirection.OUTFLOW,
              transferGroupId,
              importSource: CSV_IMPORT_SOURCE,
              importKey: row.importKey,
            },
          });

          await db.transaction.update({
            where: { id: inflow.id },
            data: {
              postedAt,
              accountId: destinationAccountId,
              amount,
              currency,
              description: row.description,
              notes: row.notes,
              counterparty: null,
              categoryId: null,
              kind: TransactionKind.TRANSFER,
              direction: TransactionDirection.INFLOW,
              transferGroupId,
              importSource: CSV_IMPORT_SOURCE,
              importKey: row.importKey,
            },
          });
        } else {
          await db.transaction.create({
            data: {
              userId: ownerId,
              postedAt,
              accountId: sourceAccountId,
              amount,
              currency,
              description: row.description,
              notes: row.notes,
              counterparty: null,
              categoryId: null,
              kind: TransactionKind.TRANSFER,
              direction: TransactionDirection.OUTFLOW,
              transferGroupId,
              importSource: CSV_IMPORT_SOURCE,
              importKey: row.importKey,
            },
          });

          await db.transaction.create({
            data: {
              userId: ownerId,
              postedAt,
              accountId: destinationAccountId,
              amount,
              currency,
              description: row.description,
              notes: row.notes,
              counterparty: null,
              categoryId: null,
              kind: TransactionKind.TRANSFER,
              direction: TransactionDirection.INFLOW,
              transferGroupId,
              importSource: CSV_IMPORT_SOURCE,
              importKey: row.importKey,
            },
          });
        }

        continue;
      }

      const existing = existingRows[0] ?? null;
      const accountId = accountRefs.get(row.accountImportKey!)?.id;
      const categoryId = row.categoryImportKey
        ? (categoryRefs.get(row.categoryImportKey)?.id ?? null)
        : null;
      const currency = accountRefs.get(row.accountImportKey!)?.currency;
      if (!accountId || !currency) {
        throw new ConflictException(
          `Transaction import ${row.importKey} could not resolve its account.`,
        );
      }
      const postedAt = new Date(row.postedAt);
      const amount = new Prisma.Decimal(row.amount);
      const data: Prisma.TransactionUncheckedCreateInput = {
        userId: ownerId,
        postedAt,
        accountId,
        categoryId,
        amount,
        currency,
        direction: row.direction!,
        kind: row.kind,
        description: row.description,
        notes: row.notes,
        counterparty: row.counterparty,
        transferGroupId: null,
        importSource: CSV_IMPORT_SOURCE,
        importKey: row.importKey,
      };

      if (existing) {
        await db.transaction.update({
          where: { id: existing.id },
          data,
        });
      } else {
        await db.transaction.create({
          data,
        });
      }
    }
  }

  private async backfillExportImportKeys(
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

  private async backfillAccountExportImportKeys(
    db: ImportDbClient,
    ownerId: string,
  ): Promise<void> {
    const rows = await db.account.findMany({
      where: { userId: ownerId },
    });

    for (const row of rows) {
      const importKey = row.importKey ?? `manual-account-${row.id}`;
      if (
        row.importSource === CSV_IMPORT_SOURCE &&
        row.importKey === importKey
      ) {
        continue;
      }

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
    });

    for (const row of rows) {
      const importKey = row.importKey ?? `manual-category-${row.id}`;
      if (
        row.importSource === CSV_IMPORT_SOURCE &&
        row.importKey === importKey
      ) {
        continue;
      }

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
    });

    for (const row of rows) {
      const importKey = row.importKey ?? `manual-asset-${row.id}`;
      if (
        row.importSource === CSV_IMPORT_SOURCE &&
        row.importKey === importKey
      ) {
        continue;
      }

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
    });

    for (const row of rows) {
      const importKey = row.importKey ?? `manual-recurring-rule-${row.id}`;
      if (
        row.importSource === CSV_IMPORT_SOURCE &&
        row.importKey === importKey
      ) {
        continue;
      }

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
    });

    for (const row of rows) {
      const importKey = row.importKey ?? `manual-budget-${row.id}`;
      if (
        row.importSource === CSV_IMPORT_SOURCE &&
        row.importKey === importKey
      ) {
        continue;
      }

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
    });
    const transferGroups = new Map<string, Transaction[]>();

    for (const row of rows) {
      if (row.kind !== TransactionKind.TRANSFER) {
        const importKey = row.importKey ?? `manual-transaction-${row.id}`;
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
      const { importKey } = this.resolveTransferRowsForExport(
        transferGroupId,
        groupRows,
      );

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

  private async loadExportState(
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
    ]);

    return {
      accounts,
      categories,
      assets,
      transactions,
      recurringRules,
      budgets,
    };
  }

  private buildExportFiles(state: ExportState): ZipFileEntry[] {
    const accountImportKeys = new Map<string, string>();
    const categoryImportKeys = new Map<string, string>();
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

    const accountCsv = this.serializeCsv(
      [...IMPORT_TEMPLATE_HEADERS.accounts],
      state.accounts.map((account) => this.toExportAccountRow(account)),
    );
    const categoryCsv = this.serializeCsv(
      [...IMPORT_TEMPLATE_HEADERS.categories],
      state.categories.map((category) => this.toExportCategoryRow(category)),
    );
    const assetCsv = this.serializeCsv(
      [...IMPORT_TEMPLATE_HEADERS.assets],
      state.assets.map((asset) =>
        this.toExportAssetRow(asset, accountImportKeys),
      ),
    );
    const transactionCsv = this.serializeCsv(
      [...IMPORT_TEMPLATE_HEADERS.transactions],
      this.toExportTransactionRows(
        state.transactions.filter((row) => row.recurringRuleId === null),
        accountImportKeys,
        categoryImportKeys,
      ),
    );
    const recurringRuleCsv = this.serializeCsv(
      [...IMPORT_TEMPLATE_HEADERS.recurringRules],
      state.recurringRules.map((rule) =>
        this.toExportRecurringRuleRow(
          rule,
          accountImportKeys,
          categoryImportKeys,
        ),
      ),
    );
    const recurringExceptionCsv = this.serializeCsv(
      [...IMPORT_TEMPLATE_HEADERS.recurringExceptions],
      this.toExportRecurringExceptionRows(
        state.recurringRules,
        recurringRuleImportKeys,
        accountImportKeys,
        categoryImportKeys,
      ),
    );
    const budgetCsv = this.serializeCsv(
      [...IMPORT_TEMPLATE_HEADERS.budgets],
      state.budgets.map((budget) =>
        this.toExportBudgetRow(budget, categoryImportKeys),
      ),
    );
    const budgetOverrideCsv = this.serializeCsv(
      [...IMPORT_TEMPLATE_HEADERS.budgetOverrides],
      this.toExportBudgetOverrideRows(state.budgets, budgetImportKeys),
    );

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
    ];
  }

  private toExportTransactionRows(
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
          this.toExportStandardTransactionRow(
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

      const groupRows = transferGroups.get(row.transferGroupId);
      if (!groupRows) {
        throw new ConflictException(
          `Transfer ${row.transferGroupId} could not be collected for export.`,
        );
      }

      orderedRows.push(
        this.toExportTransferCsvRow(
          row.transferGroupId,
          groupRows,
          accountImportKeys,
        ),
      );
      seenTransferGroups.add(row.transferGroupId);
    }

    return orderedRows;
  }

  private toExportAccountRow(account: Account): CsvRecord {
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
      order: this.serializeInteger(account.order),
      openingBalance: account.openingBalance.toString(),
      openingBalanceDate:
        account.openingBalanceDate?.toISOString().slice(0, 10) ?? '',
      archived: this.serializeBoolean(account.archivedAt !== null),
    };
  }

  private toExportCategoryRow(category: Category): CsvRecord {
    if (!category.importKey) {
      throw new ConflictException(
        `Category ${category.id} could not be exported without an import key.`,
      );
    }

    return {
      importKey: category.importKey,
      name: category.name,
      type: category.type,
      order: this.serializeInteger(category.order),
      archived: this.serializeBoolean(category.archivedAt !== null),
    };
  }

  private toExportAssetRow(
    asset: ExportAssetRecord,
    accountImportKeys: Map<string, string>,
  ): CsvRecord {
    if (!asset.importKey) {
      throw new ConflictException(
        `Asset ${asset.id} could not be exported without an import key.`,
      );
    }

    const accountImportKey = asset.accountId
      ? this.requireExportImportKey(
          accountImportKeys.get(asset.accountId),
          `Asset ${asset.id} references an account that cannot be exported.`,
        )
      : '';
    const isMarketAsset =
      asset.type === AssetType.ASSET &&
      asset.kind !== null &&
      this.isMarketKind(asset.kind);

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
      order: this.serializeOptionalInteger(asset.order),
    };
  }

  private toExportStandardTransactionRow(
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
      importKey: this.requireExportImportKey(
        row.importKey,
        `Transaction ${row.id} could not be exported without an import key.`,
      ),
      postedAt: row.postedAt.toISOString(),
      kind: row.kind,
      amount: row.amount.toString(),
      description: row.description,
      notes: row.notes ?? '',
      accountImportKey: this.requireExportImportKey(
        accountImportKeys.get(row.accountId),
        `Transaction ${row.id} references an account that cannot be exported.`,
      ),
      direction: row.direction,
      categoryImportKey: row.categoryId
        ? this.requireExportImportKey(
            categoryImportKeys.get(row.categoryId),
            `Transaction ${row.id} references a category that cannot be exported.`,
          )
        : '',
      counterparty: row.counterparty ?? '',
      sourceAccountImportKey: '',
      destinationAccountImportKey: '',
    };
  }

  private toExportTransferCsvRow(
    transferGroupId: string,
    rows: ExportTransactionRecord[],
    accountImportKeys: Map<string, string>,
  ): CsvRecord {
    const { outflow, inflow, importKey } = this.resolveTransferRowsForExport(
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
      sourceAccountImportKey: this.requireExportImportKey(
        accountImportKeys.get(outflow.accountId),
        `Transfer ${transferGroupId} references a source account that cannot be exported.`,
      ),
      destinationAccountImportKey: this.requireExportImportKey(
        accountImportKeys.get(inflow.accountId),
        `Transfer ${transferGroupId} references a destination account that cannot be exported.`,
      ),
    };
  }

  private toExportRecurringRuleRow(
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
      isActive: this.serializeBoolean(rule.isActive),
      kind: rule.kind,
      amount: rule.amount.toString(),
      dayOfMonth: String(rule.dayOfMonth),
      startDate: rule.startDate.toISOString().slice(0, 10),
      endDate: rule.endDate?.toISOString().slice(0, 10) ?? '',
      accountImportKey: rule.accountId
        ? this.requireExportImportKey(
            accountImportKeys.get(rule.accountId),
            `Recurring rule ${rule.id} references an account that cannot be exported.`,
          )
        : '',
      direction: rule.direction ?? '',
      categoryImportKey: rule.categoryId
        ? this.requireExportImportKey(
            categoryImportKeys.get(rule.categoryId),
            `Recurring rule ${rule.id} references a category that cannot be exported.`,
          )
        : '',
      counterparty: rule.counterparty ?? '',
      sourceAccountImportKey: rule.sourceAccountId
        ? this.requireExportImportKey(
            accountImportKeys.get(rule.sourceAccountId),
            `Recurring rule ${rule.id} references a source account that cannot be exported.`,
          )
        : '',
      destinationAccountImportKey: rule.destinationAccountId
        ? this.requireExportImportKey(
            accountImportKeys.get(rule.destinationAccountId),
            `Recurring rule ${rule.id} references a destination account that cannot be exported.`,
          )
        : '',
      description: rule.description,
      notes: rule.notes ?? '',
    };
  }

  private toExportRecurringExceptionRows(
    rules: ExportRecurringRuleRecord[],
    recurringRuleImportKeys: Map<string, string>,
    accountImportKeys: Map<string, string>,
    categoryImportKeys: Map<string, string>,
  ): CsvRecord[] {
    return rules.flatMap((rule) =>
      rule.occurrences.map((occurrence) => ({
        recurringRuleImportKey: this.requireExportImportKey(
          recurringRuleImportKeys.get(rule.id),
          `Recurring exception ${occurrence.id} is missing its recurring rule import key.`,
        ),
        month: occurrence.occurrenceMonth.toISOString().slice(0, 7),
        status: occurrence.status,
        amount: occurrence.overrideAmount?.toString() ?? '',
        postedAtDate:
          occurrence.overridePostedAtDate?.toISOString().slice(0, 10) ?? '',
        accountImportKey: occurrence.overrideAccountId
          ? this.requireExportImportKey(
              accountImportKeys.get(occurrence.overrideAccountId),
              `Recurring exception ${occurrence.id} references an account that cannot be exported.`,
            )
          : '',
        direction: occurrence.overrideDirection ?? '',
        categoryImportKey: occurrence.overrideCategoryId
          ? this.requireExportImportKey(
              categoryImportKeys.get(occurrence.overrideCategoryId),
              `Recurring exception ${occurrence.id} references a category that cannot be exported.`,
            )
          : '',
        counterparty: occurrence.overrideCounterparty ?? '',
        sourceAccountImportKey: occurrence.overrideSourceAccountId
          ? this.requireExportImportKey(
              accountImportKeys.get(occurrence.overrideSourceAccountId),
              `Recurring exception ${occurrence.id} references a source account that cannot be exported.`,
            )
          : '',
        destinationAccountImportKey: occurrence.overrideDestinationAccountId
          ? this.requireExportImportKey(
              accountImportKeys.get(occurrence.overrideDestinationAccountId),
              `Recurring exception ${occurrence.id} references a destination account that cannot be exported.`,
            )
          : '',
        description: occurrence.overrideDescription ?? '',
        notes: occurrence.overrideNotes ?? '',
      })),
    );
  }

  private toExportBudgetRow(
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
      categoryImportKey: this.requireExportImportKey(
        categoryImportKeys.get(budget.categoryId),
        `Budget ${budget.id} references a category that cannot be exported.`,
      ),
      currency: budget.currency,
      amount: budget.amount.toString(),
      startMonth: budget.startMonth.toISOString().slice(0, 7),
      endMonth: budget.endMonth?.toISOString().slice(0, 7) ?? '',
    };
  }

  private toExportBudgetOverrideRows(
    budgets: ExportBudgetRecord[],
    budgetImportKeys: Map<string, string>,
  ): CsvRecord[] {
    return budgets.flatMap((budget) =>
      budget.overrides.map((override) => ({
        budgetImportKey: this.requireExportImportKey(
          budgetImportKeys.get(budget.id),
          `Budget override ${override.id} is missing its budget import key.`,
        ),
        month: override.month.toISOString().slice(0, 7),
        amount: override.amount.toString(),
        note: override.note ?? '',
      })),
    );
  }

  private resolveTransferRowsForExport<T extends Transaction>(
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

  private serializeCsv(headers: readonly string[], rows: CsvRecord[]): string {
    const lines = [
      headers.join(','),
      ...rows.map((row) =>
        headers
          .map((header) => this.escapeCsvField(row[header] ?? ''))
          .join(','),
      ),
    ];

    return `${lines.join('\n')}\n`;
  }

  private escapeCsvField(value: string): string {
    const sanitized = this.neutralizeSpreadsheetFormula(value);

    if (!/[",\n\r]/.test(sanitized)) {
      return sanitized;
    }

    return `"${sanitized.replace(/"/g, '""')}"`;
  }

  private neutralizeSpreadsheetFormula(value: string): string {
    return /^[\s]*[=+\-@]/.test(value) ? `'${value}` : value;
  }

  private buildZipArchive(entries: ZipFileEntry[]): Buffer {
    const localParts: Buffer[] = [];
    const centralParts: Buffer[] = [];
    let offset = 0;
    const { dosTime, dosDate } = this.toDosDateTime(new Date());

    for (const entry of entries) {
      const fileName = Buffer.from(entry.name, 'utf8');
      const crc32 = this.crc32(entry.data);

      const localHeader = Buffer.alloc(30);
      localHeader.writeUInt32LE(0x04034b50, 0);
      localHeader.writeUInt16LE(ZIP_VERSION, 4);
      localHeader.writeUInt16LE(0, 6);
      localHeader.writeUInt16LE(ZIP_STORE_METHOD, 8);
      localHeader.writeUInt16LE(dosTime, 10);
      localHeader.writeUInt16LE(dosDate, 12);
      localHeader.writeUInt32LE(crc32, 14);
      localHeader.writeUInt32LE(entry.data.length, 18);
      localHeader.writeUInt32LE(entry.data.length, 22);
      localHeader.writeUInt16LE(fileName.length, 26);
      localHeader.writeUInt16LE(0, 28);

      localParts.push(localHeader, fileName, entry.data);

      const centralHeader = Buffer.alloc(46);
      centralHeader.writeUInt32LE(0x02014b50, 0);
      centralHeader.writeUInt16LE(ZIP_VERSION, 4);
      centralHeader.writeUInt16LE(ZIP_VERSION, 6);
      centralHeader.writeUInt16LE(0, 8);
      centralHeader.writeUInt16LE(ZIP_STORE_METHOD, 10);
      centralHeader.writeUInt16LE(dosTime, 12);
      centralHeader.writeUInt16LE(dosDate, 14);
      centralHeader.writeUInt32LE(crc32, 16);
      centralHeader.writeUInt32LE(entry.data.length, 20);
      centralHeader.writeUInt32LE(entry.data.length, 24);
      centralHeader.writeUInt16LE(fileName.length, 28);
      centralHeader.writeUInt16LE(0, 30);
      centralHeader.writeUInt16LE(0, 32);
      centralHeader.writeUInt16LE(0, 34);
      centralHeader.writeUInt16LE(0, 36);
      centralHeader.writeUInt32LE(0, 38);
      centralHeader.writeUInt32LE(offset, 42);

      centralParts.push(centralHeader, fileName);
      offset += localHeader.length + fileName.length + entry.data.length;
    }

    const localBuffer = Buffer.concat(localParts);
    const centralBuffer = Buffer.concat(centralParts);
    const endOfCentralDirectory = Buffer.alloc(22);

    endOfCentralDirectory.writeUInt32LE(0x06054b50, 0);
    endOfCentralDirectory.writeUInt16LE(0, 4);
    endOfCentralDirectory.writeUInt16LE(0, 6);
    endOfCentralDirectory.writeUInt16LE(entries.length, 8);
    endOfCentralDirectory.writeUInt16LE(entries.length, 10);
    endOfCentralDirectory.writeUInt32LE(centralBuffer.length, 12);
    endOfCentralDirectory.writeUInt32LE(localBuffer.length, 16);
    endOfCentralDirectory.writeUInt16LE(0, 20);

    return Buffer.concat([localBuffer, centralBuffer, endOfCentralDirectory]);
  }

  private crc32(buffer: Buffer): number {
    let crc = 0xffffffff;

    for (const byte of buffer) {
      crc = CRC32_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
    }

    return (crc ^ 0xffffffff) >>> 0;
  }

  private toDosDateTime(date: Date): { dosTime: number; dosDate: number } {
    const year = Math.min(Math.max(date.getUTCFullYear(), 1980), 2107);
    const dosTime =
      (date.getUTCHours() << 11) |
      (date.getUTCMinutes() << 5) |
      Math.floor(date.getUTCSeconds() / 2);
    const dosDate =
      ((year - 1980) << 9) |
      ((date.getUTCMonth() + 1) << 5) |
      date.getUTCDate();

    return { dosTime, dosDate };
  }

  private formatExportDate(date: Date): string {
    return EXPORT_DATE_FORMATTER.format(date);
  }

  private serializeBoolean(value: boolean): string {
    return value ? 'true' : 'false';
  }

  private serializeInteger(value: number): string {
    return String(value);
  }

  private serializeOptionalInteger(value: number | null): string {
    return value === null ? '' : String(value);
  }

  private requireExportImportKey(
    value: string | null | undefined,
    message: string,
  ): string {
    if (!value) {
      throw new ConflictException(message);
    }

    return value;
  }

  private createEmptySummary(
    providedFiles: ImportFileType[],
  ): ImportBatchSummaryResponse {
    return {
      files: providedFiles.map((file) => ({
        file,
        createCount: 0,
        updateCount: 0,
        unchangedCount: 0,
      })),
      errorCount: 0,
      warningCount: 0,
    };
  }

  private bumpSummary(
    summary: ImportBatchSummaryResponse,
    file: ImportFileType,
    field: keyof Omit<ImportFileSummaryResponse, 'file'>,
  ): void {
    const target = summary.files.find((entry) => entry.file === file);
    if (!target) {
      return;
    }

    target[field] += 1;
  }

  private collectDuplicateRowKeys(
    payload: ImportPayload,
  ): Map<ImportFileType, Set<string>> {
    const duplicates = new Map<ImportFileType, Set<string>>();

    const collect = <T extends { rowNumber: number }>(
      file: ImportFileType,
      rows: T[],
      keySelector: (row: T) => string,
    ) => {
      const seen = new Map<string, number>();
      const fileDuplicates = new Set<string>();

      for (const row of rows) {
        const key = keySelector(row);
        const previous = seen.get(key);
        if (previous) {
          fileDuplicates.add(String(previous));
          fileDuplicates.add(String(row.rowNumber));
        } else {
          seen.set(key, row.rowNumber);
        }
      }

      duplicates.set(file, fileDuplicates);
    };

    collect('accounts', payload.accounts, (row) => row.importKey);
    collect('categories', payload.categories, (row) => row.importKey);
    collect('assets', payload.assets, (row) => row.importKey);
    collect('transactions', payload.transactions, (row) => row.importKey);
    collect('recurringRules', payload.recurringRules, (row) => row.importKey);
    collect(
      'recurringExceptions',
      payload.recurringExceptions,
      (row) => `${row.recurringRuleImportKey}:${row.month}`,
    );
    collect('budgets', payload.budgets, (row) => row.importKey);
    collect(
      'budgetOverrides',
      payload.budgetOverrides,
      (row) => `${row.budgetImportKey}:${row.month}`,
    );
    return duplicates;
  }

  private rowHasErrors(
    file: ImportFileType,
    rowNumber: number,
    issues: ImportRowIssueResponse[],
    duplicateRowKeys: Map<ImportFileType, Set<string>>,
  ): boolean {
    if (duplicateRowKeys.get(file)?.has(`${rowNumber}`)) {
      return true;
    }

    return issues.some(
      (issue) =>
        issue.file === file &&
        issue.rowNumber === rowNumber &&
        issue.severity === 'ERROR',
    );
  }

  private issue(
    file: ImportFileType,
    rowNumber: number,
    field: string | null,
    message: string,
  ): ImportRowIssueResponse {
    return {
      file,
      rowNumber,
      field,
      severity: 'ERROR',
      message,
    };
  }

  private requiredText(
    value: string | undefined,
    _file: ImportFileType,
    _rowNumber: number,
    field: string,
    maxLength: number = MAX_NAME_LENGTH,
  ): string {
    const normalized = this.restoreSpreadsheetFormulaPrefix(value).trim();

    if (!normalized) {
      throw new BadRequestException(`${field} is required.`);
    }

    if (field === 'importKey' && normalized.length > MAX_IMPORT_KEY_LENGTH) {
      throw new BadRequestException(`${field} is too long.`);
    }

    if (field !== 'importKey' && normalized.length > maxLength) {
      throw new BadRequestException(`${field} is too long.`);
    }

    return normalized;
  }

  private optionalText(
    value: string | undefined,
    maxLength: number = MAX_NOTES_LENGTH,
  ): string | null {
    const normalized = this.restoreSpreadsheetFormulaPrefix(value).trim();
    if (!normalized) {
      return null;
    }

    if (normalized.length > maxLength) {
      throw new BadRequestException('Text value exceeds the maximum length.');
    }

    return normalized;
  }

  private restoreSpreadsheetFormulaPrefix(value: string | undefined): string {
    const normalized = value ?? '';

    if (
      normalized.startsWith("'") &&
      /^[\s]*[=+\-@]/.test(normalized.slice(1))
    ) {
      return normalized.slice(1);
    }

    return normalized;
  }

  private parseRequiredCurrency(value: string | undefined): string {
    if (!value?.trim()) {
      throw new BadRequestException('currency is required.');
    }

    return this.pricesService.normalizeCurrency(value);
  }

  private optionalInteger(value: string | undefined): number | null {
    const normalized = value?.trim() ?? '';
    if (!normalized) {
      return null;
    }

    if (!/^-?\d+$/.test(normalized)) {
      throw new BadRequestException('Expected an integer value.');
    }

    return Math.trunc(Number(normalized));
  }

  private optionalBoolean(value: string | undefined): boolean {
    const normalized = (value ?? '').trim().toLowerCase();

    if (CSV_TRUE_VALUES.has(normalized)) {
      return true;
    }

    if (CSV_FALSE_VALUES.has(normalized)) {
      return false;
    }

    throw new BadRequestException('Expected a boolean value (true/false).');
  }

  private parseEnumValue<T extends string>(
    value: string | undefined,
    allowed: readonly T[],
    _file: ImportFileType,
    _rowNumber: number,
    field: string,
  ): T {
    const normalized = value?.trim().toUpperCase() ?? '';
    if (!normalized) {
      throw new BadRequestException(`${field} is required.`);
    }

    if (!allowed.includes(normalized as T)) {
      throw new BadRequestException(
        `${field} must be one of: ${allowed.join(', ')}.`,
      );
    }

    return normalized as T;
  }

  private optionalDecimal(value: string | undefined): string | null {
    const normalized = value?.trim() ?? '';
    if (!normalized) {
      return null;
    }

    try {
      const decimal = new Prisma.Decimal(normalized);
      if (decimal.lte(ZERO)) {
        throw new Error('non-positive');
      }

      return decimal.toString();
    } catch {
      throw new BadRequestException('Expected a positive decimal value.');
    }
  }

  private requiredDecimal(
    value: string | undefined,
    file: ImportFileType,
    rowNumber: number,
    field: string,
  ): string {
    const parsed = this.optionalDecimal(value);
    if (!parsed) {
      throw new BadRequestException(`${field} is required.`);
    }

    return parsed;
  }

  private parseDateString(
    value: string | undefined,
    _file: ImportFileType,
    _rowNumber: number,
    field: string,
  ): string {
    const normalized = value?.trim() ?? '';
    if (!normalized) {
      throw new BadRequestException(`${field} is required.`);
    }

    const date = new Date(normalized);
    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException(`${field} must be a valid ISO date/time.`);
    }

    return date.toISOString();
  }

  private requiredDateOnlyString(
    value: string | undefined,
    _file: ImportFileType,
    _rowNumber: number,
    field: string,
  ): string {
    const normalized = value?.trim() ?? '';
    if (!normalized) {
      throw new BadRequestException(`${field} is required.`);
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
      throw new BadRequestException(
        `${field} must be a valid YYYY-MM-DD date.`,
      );
    }

    const date = new Date(`${normalized}T00:00:00.000Z`);
    if (
      Number.isNaN(date.getTime()) ||
      date.toISOString().slice(0, 10) !== normalized
    ) {
      throw new BadRequestException(
        `${field} must be a valid YYYY-MM-DD date.`,
      );
    }

    return normalized;
  }

  private optionalDateOnlyString(
    value: string | undefined,
    file: ImportFileType,
    rowNumber: number,
    field: string,
  ): string | null {
    const normalized = value?.trim() ?? '';
    if (!normalized) {
      return null;
    }

    return this.requiredDateOnlyString(normalized, file, rowNumber, field);
  }

  private requiredMonthKey(
    value: string | undefined,
    _file: ImportFileType,
    _rowNumber: number,
    field: string,
  ): string {
    const normalized = value?.trim() ?? '';
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(normalized)) {
      throw new BadRequestException(`${field} must be a valid YYYY-MM month.`);
    }

    return normalized;
  }

  private optionalMonthKey(
    value: string | undefined,
    file: ImportFileType,
    rowNumber: number,
    field: string,
  ): string | null {
    const normalized = value?.trim() ?? '';
    if (!normalized) {
      return null;
    }

    return this.requiredMonthKey(normalized, file, rowNumber, field);
  }

  private optionalSignedDecimal(value: string | undefined): string | null {
    const normalized = value?.trim() ?? '';
    if (!normalized) {
      return null;
    }

    try {
      return new Prisma.Decimal(normalized).toString();
    } catch {
      throw new BadRequestException('Expected a decimal value.');
    }
  }

  private requiredDayOfMonth(value: string | undefined): number {
    const normalized = value?.trim() ?? '';
    if (!/^\d+$/.test(normalized)) {
      throw new BadRequestException(
        'dayOfMonth must be an integer between 1 and 31.',
      );
    }

    const dayOfMonth = Number(normalized);
    if (dayOfMonth < 1 || dayOfMonth > 31) {
      throw new BadRequestException(
        'dayOfMonth must be an integer between 1 and 31.',
      );
    }

    return dayOfMonth;
  }

  private monthRangesOverlap(
    leftStart: string,
    leftEnd: string | null,
    rightStart: string,
    rightEnd: string | null,
  ): boolean {
    const normalizedLeftEnd = leftEnd ?? '9999-12';
    const normalizedRightEnd = rightEnd ?? '9999-12';

    return leftStart <= normalizedRightEnd && rightStart <= normalizedLeftEnd;
  }

  private monthIsWithinCoverage(
    month: string,
    startMonth: string,
    endMonth: string | null,
  ): boolean {
    return month >= startMonth && (!endMonth || month <= endMonth);
  }

  private monthKeyFromDateKey(dateKey: string): string {
    return dateKey.slice(0, 7);
  }

  private getOccurrenceDateKey(monthKey: string, dayOfMonth: number): string {
    const [year, month] = monthKey.split('-').map(Number);
    const lastDayOfMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const clampedDay = Math.min(dayOfMonth, lastDayOfMonth);

    return `${monthKey}-${String(clampedDay).padStart(2, '0')}`;
  }

  private getFirstOccurrenceDateKey(
    startDateKey: string,
    dayOfMonth: number,
  ): string {
    const monthKey = this.monthKeyFromDateKey(startDateKey);
    const occurrenceDateKey = this.getOccurrenceDateKey(monthKey, dayOfMonth);
    if (occurrenceDateKey >= startDateKey) {
      return occurrenceDateKey;
    }

    const [year, month] = monthKey.split('-').map(Number);
    const nextMonth = month === 12 ? 1 : month + 1;
    const nextYear = month === 12 ? year + 1 : year;
    const nextMonthKey = `${nextYear}-${String(nextMonth).padStart(2, '0')}`;
    return this.getOccurrenceDateKey(nextMonthKey, dayOfMonth);
  }

  private ruleStartRespectsAccountBaseline(
    startDateKey: string,
    dayOfMonth: number,
    account: AccountImportRef,
  ): boolean {
    if (!account.openingBalanceDate) {
      return true;
    }

    return (
      this.getFirstOccurrenceDateKey(startDateKey, dayOfMonth) >=
      account.openingBalanceDate
    );
  }

  private recurringRuleAppliesToMonth(
    startDateKey: string,
    endDateKey: string | null,
    dayOfMonth: number,
    monthKey: string,
  ): boolean {
    const occurrenceDateKey = this.getOccurrenceDateKey(monthKey, dayOfMonth);
    return (
      occurrenceDateKey >= startDateKey &&
      (!endDateKey || occurrenceDateKey <= endDateKey)
    );
  }

  private isMarketKind(kind: AssetKind | null): kind is AssetKind {
    return kind !== null && MARKET_ASSET_KINDS.has(kind);
  }

  private normalizeAssetTicker(
    kind: AssetKind,
    ticker: string,
    currency: string,
  ): string {
    const normalized = this.pricesService.normalizeTicker(ticker);

    if (normalized.length > MAX_TICKER_LENGTH) {
      throw new BadRequestException('ticker is too long.');
    }

    if (kind !== AssetKind.CRYPTO) {
      return normalized;
    }

    const [baseAsset, quoteCurrency] = normalized.split('-');
    if (!baseAsset) {
      throw new BadRequestException('Crypto ticker is required.');
    }

    if (quoteCurrency && quoteCurrency !== currency) {
      throw new BadRequestException(
        `Crypto ticker ${normalized} does not match currency ${currency}.`,
      );
    }

    return quoteCurrency ? normalized : `${baseAsset}-${currency}`;
  }

  private normalizeAssetExchange(
    kind: AssetKind,
    exchange: string | null,
  ): string {
    const normalized = (exchange ?? '').trim().toUpperCase();

    if (normalized.length > MAX_EXCHANGE_LENGTH) {
      throw new BadRequestException('exchange is too long.');
    }

    if (kind === AssetKind.CRYPTO) {
      if (normalized && normalized !== '_CRYPTO_') {
        throw new BadRequestException(
          'Crypto assets must use the crypto exchange sentinel.',
        );
      }

      return '_CRYPTO_';
    }

    if (normalized === '_CRYPTO_') {
      throw new BadRequestException(
        'Only crypto assets may use the crypto exchange sentinel.',
      );
    }

    return normalized;
  }

  private equalAccountRow(
    existing: Account,
    row: AccountImportRow,
    targetOrder: number,
  ): boolean {
    return (
      existing.name === row.name &&
      existing.type === row.type &&
      existing.currency === row.currency &&
      (existing.institution ?? null) === row.institution &&
      (existing.notes ?? null) === row.notes &&
      existing.order === targetOrder &&
      this.equalDecimal(existing.openingBalance, row.openingBalance ?? '0') &&
      (existing.openingBalanceDate?.toISOString().slice(0, 10) ?? null) ===
        row.openingBalanceDate &&
      (existing.archivedAt !== null) === row.archived
    );
  }

  private equalCategoryRow(
    existing: Category,
    row: CategoryImportRow,
    targetOrder: number,
  ): boolean {
    return (
      existing.name === row.name &&
      existing.type === row.type &&
      existing.order === targetOrder &&
      (existing.archivedAt !== null) === row.archived
    );
  }

  private equalAssetRow(
    existing: Asset,
    row: AssetImportRow,
    targetOrder: number,
    accountImportKeyById: Map<string, string>,
  ): boolean {
    const existingAccountImportKey = existing.accountId
      ? (accountImportKeyById.get(existing.accountId) ?? null)
      : null;

    return (
      existing.name === row.name &&
      existing.type === row.type &&
      existingAccountImportKey === row.accountImportKey &&
      existing.kind === row.kind &&
      existing.liabilityKind === row.liabilityKind &&
      existing.currency === row.currency &&
      (existing.notes ?? null) === row.notes &&
      (existing.order ?? 0) === targetOrder &&
      existing.ticker === row.ticker &&
      existing.exchange === row.exchange &&
      this.equalDecimal(existing.quantity, row.quantity) &&
      this.equalDecimal(existing.unitPrice, row.unitPrice) &&
      this.equalDecimal(existing.balance, row.balance)
    );
  }

  private equalStandardTransactionRow(
    existing: Transaction,
    row: TransactionImportRow,
    accountImportKeyById: Map<string, string>,
    categoryImportKeyById: Map<string, string>,
  ): boolean {
    const existingAccountImportKey =
      accountImportKeyById.get(existing.accountId) ?? null;
    const existingCategoryImportKey = existing.categoryId
      ? (categoryImportKeyById.get(existing.categoryId) ?? null)
      : null;

    return (
      existing.postedAt.toISOString() === row.postedAt &&
      existing.kind === row.kind &&
      existingAccountImportKey === row.accountImportKey &&
      existing.direction === row.direction &&
      existingCategoryImportKey === row.categoryImportKey &&
      existing.description === row.description &&
      (existing.notes ?? null) === row.notes &&
      (existing.counterparty ?? null) === row.counterparty &&
      this.equalDecimal(existing.amount, row.amount)
    );
  }

  private equalTransferRow(
    existingRows: Transaction[],
    row: TransactionImportRow,
    accountImportKeyById: Map<string, string>,
  ): boolean {
    const outflow = existingRows.find(
      (existing) => existing.direction === TransactionDirection.OUTFLOW,
    );
    const inflow = existingRows.find(
      (existing) => existing.direction === TransactionDirection.INFLOW,
    );

    if (!outflow || !inflow) {
      return false;
    }

    const existingSourceKey =
      accountImportKeyById.get(outflow.accountId) ?? null;
    const existingDestinationKey =
      accountImportKeyById.get(inflow.accountId) ?? null;

    return (
      outflow.postedAt.toISOString() === row.postedAt &&
      inflow.postedAt.toISOString() === row.postedAt &&
      existingSourceKey === row.sourceAccountImportKey &&
      existingDestinationKey === row.destinationAccountImportKey &&
      outflow.description === row.description &&
      inflow.description === row.description &&
      (outflow.notes ?? null) === row.notes &&
      (inflow.notes ?? null) === row.notes &&
      this.equalDecimal(outflow.amount, row.amount) &&
      this.equalDecimal(inflow.amount, row.amount)
    );
  }

  private equalRecurringRuleRow(
    existing: RecurringTransactionRule,
    row: RecurringRuleImportRow,
    accountImportKeyById: Map<string, string>,
    categoryImportKeyById: Map<string, string>,
  ): boolean {
    const existingAccountImportKey = existing.accountId
      ? (accountImportKeyById.get(existing.accountId) ?? null)
      : null;
    const existingCategoryImportKey = existing.categoryId
      ? (categoryImportKeyById.get(existing.categoryId) ?? null)
      : null;
    const existingSourceAccountImportKey = existing.sourceAccountId
      ? (accountImportKeyById.get(existing.sourceAccountId) ?? null)
      : null;
    const existingDestinationAccountImportKey = existing.destinationAccountId
      ? (accountImportKeyById.get(existing.destinationAccountId) ?? null)
      : null;

    return (
      existing.name === row.name &&
      existing.isActive === row.isActive &&
      existing.kind === row.kind &&
      this.equalDecimal(existing.amount, row.amount) &&
      existing.dayOfMonth === row.dayOfMonth &&
      existing.startDate.toISOString().slice(0, 10) === row.startDate &&
      (existing.endDate?.toISOString().slice(0, 10) ?? null) === row.endDate &&
      existingAccountImportKey === row.accountImportKey &&
      (existing.direction ?? null) === row.direction &&
      existingCategoryImportKey === row.categoryImportKey &&
      (existing.counterparty ?? null) === row.counterparty &&
      existingSourceAccountImportKey === row.sourceAccountImportKey &&
      existingDestinationAccountImportKey === row.destinationAccountImportKey &&
      existing.description === row.description &&
      (existing.notes ?? null) === row.notes
    );
  }

  private equalRecurringExceptionRow(
    existing: RecurringTransactionOccurrence,
    row: RecurringExceptionImportRow,
    accountImportKeyById: Map<string, string>,
    categoryImportKeyById: Map<string, string>,
  ): boolean {
    const normalized = this.normalizeRecurringExceptionOverride(row);
    const existingAccountImportKey = existing.overrideAccountId
      ? (accountImportKeyById.get(existing.overrideAccountId) ?? null)
      : null;
    const existingCategoryImportKey = existing.overrideCategoryId
      ? (categoryImportKeyById.get(existing.overrideCategoryId) ?? null)
      : null;
    const existingSourceAccountImportKey = existing.overrideSourceAccountId
      ? (accountImportKeyById.get(existing.overrideSourceAccountId) ?? null)
      : null;
    const existingDestinationAccountImportKey =
      existing.overrideDestinationAccountId
        ? (accountImportKeyById.get(existing.overrideDestinationAccountId) ??
          null)
        : null;

    return (
      existing.occurrenceMonth.toISOString().slice(0, 7) === row.month &&
      existing.status === row.status &&
      this.equalDecimal(existing.overrideAmount, normalized.amount) &&
      (existing.overridePostedAtDate?.toISOString().slice(0, 10) ?? null) ===
        normalized.postedAtDate &&
      existingAccountImportKey === normalized.accountImportKey &&
      (existing.overrideDirection ?? null) === normalized.direction &&
      existingCategoryImportKey === normalized.categoryImportKey &&
      (existing.overrideCounterparty ?? null) === normalized.counterparty &&
      existingSourceAccountImportKey === normalized.sourceAccountImportKey &&
      existingDestinationAccountImportKey ===
        normalized.destinationAccountImportKey &&
      (existing.overrideDescription ?? null) === normalized.description &&
      (existing.overrideNotes ?? null) === normalized.notes
    );
  }

  private normalizeRecurringExceptionOverride(
    row: RecurringExceptionImportRow,
  ): Omit<
    RecurringExceptionImportRow,
    'rowNumber' | 'recurringRuleImportKey' | 'month' | 'status'
  > {
    if (row.status === RecurringOccurrenceStatus.OVERRIDDEN) {
      return {
        amount: row.amount,
        postedAtDate: row.postedAtDate,
        accountImportKey: row.accountImportKey,
        direction: row.direction,
        categoryImportKey: row.categoryImportKey,
        counterparty: row.counterparty,
        sourceAccountImportKey: row.sourceAccountImportKey,
        destinationAccountImportKey: row.destinationAccountImportKey,
        description: row.description,
        notes: row.notes,
      };
    }

    return {
      amount: null,
      postedAtDate: null,
      accountImportKey: null,
      direction: null,
      categoryImportKey: null,
      counterparty: null,
      sourceAccountImportKey: null,
      destinationAccountImportKey: null,
      description: null,
      notes: null,
    };
  }

  private equalBudgetRow(
    existing: CategoryBudget,
    row: BudgetImportRow,
    categoryImportKeyById: Map<string, string>,
  ): boolean {
    const existingCategoryImportKey =
      categoryImportKeyById.get(existing.categoryId) ?? null;

    return (
      existingCategoryImportKey === row.categoryImportKey &&
      existing.currency === row.currency &&
      this.equalDecimal(existing.amount, row.amount) &&
      existing.startMonth.toISOString().slice(0, 7) === row.startMonth &&
      (existing.endMonth?.toISOString().slice(0, 7) ?? null) === row.endMonth
    );
  }

  private equalBudgetOverrideRow(
    existing: CategoryBudgetOverride,
    row: BudgetOverrideImportRow,
  ): boolean {
    return (
      existing.month.toISOString().slice(0, 7) === row.month &&
      this.equalDecimal(existing.amount, row.amount) &&
      (existing.note ?? null) === row.note
    );
  }

  private equalDecimal(
    existing: Prisma.Decimal | null,
    next: string | null,
  ): boolean {
    if (existing === null && next === null) {
      return true;
    }

    if (existing === null || next === null) {
      return false;
    }

    return existing.eq(new Prisma.Decimal(next));
  }

  private isExistingMarketAsset(asset: Asset): boolean {
    return (
      asset.type === AssetType.ASSET &&
      asset.kind !== null &&
      this.isMarketKind(asset.kind)
    );
  }

  private marketAssetKey(
    kind: AssetKind,
    ticker: string,
    exchange: string,
  ): string {
    return `${kind}:${ticker}:${exchange}`;
  }

  private pruneExpiredPreviewPayloads(): void {
    const now = Date.now();

    for (const [batchId, preview] of this.previewPayloads.entries()) {
      if (preview.expiresAt <= now) {
        this.previewPayloads.delete(batchId);
      }
    }
  }

  private async clearExpiredPersistedPreviewPayloads(
    ownerId: string,
    now: Date = new Date(),
  ): Promise<void> {
    const previewCutoff = new Date(now.getTime() - IMPORT_PREVIEW_TTL_MS);

    await this.prisma.importBatch.updateMany({
      where: {
        userId: ownerId,
        status: ImportBatchStatus.PREVIEW,
        createdAt: { lt: previewCutoff },
      },
      data: {
        payloadJson: Prisma.DbNull,
      },
    });
  }

  private toImportBatchResponse(batch: ImportBatch): ImportBatchResponse {
    return {
      id: batch.id,
      source: batch.source,
      status: batch.status,
      summary: batch.summaryJson as unknown as ImportBatchSummaryResponse,
      issues: batch.errorJson as unknown as ImportRowIssueResponse[],
      createdAt: batch.createdAt.toISOString(),
      appliedAt: batch.appliedAt?.toISOString() ?? null,
    };
  }

  private toImportPreviewResponse(
    batch: ImportBatch,
    canApply: boolean,
  ): ImportPreviewResponse {
    return {
      ...this.toImportBatchResponse(batch),
      canApply,
    };
  }

  private fromStoredImportPayload(
    value: Prisma.JsonValue | null,
  ): ImportPayload | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return null;
    }

    return value as unknown as ImportPayload;
  }

  private toJsonValue(value: unknown): Prisma.InputJsonValue {
    return value as Prisma.InputJsonValue;
  }

  private describeError(error: unknown): string {
    if (error instanceof BadRequestException) {
      const response = error.getResponse();

      if (typeof response === 'string') {
        return response;
      }

      if (
        typeof response === 'object' &&
        response !== null &&
        'message' in response
      ) {
        const message = (response as { message?: unknown }).message;

        if (Array.isArray(message)) {
          return message.join(', ');
        }

        if (typeof message === 'string') {
          return message;
        }
      }

      return error.message;
    }

    if (error instanceof Error) {
      return error.message;
    }

    return 'Import validation failed.';
  }
}

function buildCrc32Table(): Uint32Array {
  const table = new Uint32Array(256);

  for (let index = 0; index < table.length; index += 1) {
    let value = index;

    for (let bit = 0; bit < 8; bit += 1) {
      value = (value & 1) === 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }

    table[index] = value >>> 0;
  }

  return table;
}
