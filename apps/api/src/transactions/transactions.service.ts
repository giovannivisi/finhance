import {
  forwardRef,
  Inject,
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { AccountsService } from '@accounts/accounts.service';
import { PrismaService } from '@prisma/prisma.service';
import { CategoriesService } from '@transactions/categories.service';
import { CreateTransactionDto } from '@transactions/dto/create-transaction.dto';
import { UpdateTransactionDto } from '@transactions/dto/update-transaction.dto';
import {
  CashflowFilters,
  LogicalTransactionEntry,
  MonthlyCashflowFilters,
  TransactionFilters,
  TransactionRecord,
} from '@transactions/transactions.types';
import {
  Account,
  CategoryType,
  Prisma,
  TransactionDirection,
  TransactionKind,
} from '@prisma/client';
import type {
  CashflowSummaryResponse,
  CashflowCurrencySummaryResponse,
  MonthlyCashflowCategoryTotalResponse,
  MonthlyCashflowCurrencyResponse,
  MonthlyCashflowMonthResponse,
  MonthlyCashflowResponse,
} from '@finhance/shared';
import {
  addMonthsToRomeMonth,
  diffRomeMonths,
  romeDateToUtcExclusiveEnd,
  romeDateToUtcStart,
  romeMonthToUtcExclusiveEnd,
  romeMonthToUtcStart,
  utcDateToRomeMonth,
} from '@transactions/transactions.dates';

const DEFAULT_TRANSACTION_LIMIT = 200;
const MAX_TRANSACTION_LIMIT = 500;
const DEFAULT_TRANSACTION_OFFSET = 0;
const MAX_TRANSACTION_RANGE_DAYS = 3_650;
const MAX_MONTHLY_CASHFLOW_RANGE_MONTHS = 24;
const LOCAL_MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;
const ROME_DATE_FORMATTER = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Rome',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

interface PreparedStandardTransactionInput {
  postedAt: Date;
  amount: Prisma.Decimal;
  currency: string;
  kind: 'EXPENSE' | 'INCOME' | 'ADJUSTMENT';
  direction: TransactionDirection;
  accountId: string;
  categoryId: string | null;
  description: string;
  notes: string | null;
  counterparty: string | null;
}

interface PreparedTransferTransactionInput {
  postedAt: Date;
  amount: Prisma.Decimal;
  currency: string;
  description: string;
  notes: string | null;
  sourceAccountId: string;
  destinationAccountId: string;
}

type TransactionWriteClient = PrismaService | Prisma.TransactionClient;

@Injectable()
export class TransactionsService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => AccountsService))
    private readonly accountsService: AccountsService,
    private readonly categoriesService: CategoriesService,
  ) {}

  async findAll(
    ownerId: string,
    filters: TransactionFilters,
  ): Promise<LogicalTransactionEntry[]> {
    const normalizedFilters = this.normalizeTransactionFilters(filters);
    const rows = await this.findRows(ownerId, normalizedFilters);
    const entries = this.toLogicalEntries(rows)
      .filter((entry) => this.matchesFilters(entry, normalizedFilters))
      .sort((left, right) => this.compareEntriesDesc(left, right));

    if (
      normalizedFilters.limit === undefined &&
      normalizedFilters.offset === undefined
    ) {
      return entries;
    }

    const offset = normalizedFilters.offset ?? DEFAULT_TRANSACTION_OFFSET;
    const limit = normalizedFilters.limit;

    return entries.slice(
      offset,
      limit === undefined ? undefined : offset + limit,
    );
  }

  async findOne(ownerId: string, id: string): Promise<LogicalTransactionEntry> {
    const byId = await this.prisma.transaction.findFirst({
      where: { id, userId: ownerId },
      include: {
        account: true,
        category: true,
      },
    });

    if (byId) {
      if (byId.kind !== TransactionKind.TRANSFER) {
        return {
          entryType: 'STANDARD',
          row: byId,
        };
      }

      return this.findTransferEntry(ownerId, byId.transferGroupId ?? id);
    }

    return this.findTransferEntry(ownerId, id);
  }

  async create(
    ownerId: string,
    dto: CreateTransactionDto,
    client: TransactionWriteClient = this.prisma,
  ): Promise<LogicalTransactionEntry> {
    if (dto.kind === TransactionKind.TRANSFER) {
      return this.createTransfer(ownerId, dto, client);
    }

    const prepared = await this.prepareStandardTransaction(ownerId, dto);
    const row = await client.transaction.create({
      data: {
        userId: ownerId,
        postedAt: prepared.postedAt,
        accountId: prepared.accountId,
        categoryId: prepared.categoryId,
        amount: prepared.amount,
        currency: prepared.currency,
        direction: prepared.direction,
        kind: prepared.kind,
        description: prepared.description,
        notes: prepared.notes,
        counterparty: prepared.counterparty,
        transferGroupId: null,
      },
      include: {
        account: true,
        category: true,
      },
    });

    return {
      entryType: 'STANDARD',
      row,
    };
  }

  async createReconciliationAdjustment(
    ownerId: string,
    input: {
      accountId: string;
      amount: Prisma.Decimal;
      direction: TransactionDirection;
      notes: string;
    },
    client: TransactionWriteClient = this.prisma,
  ): Promise<LogicalTransactionEntry> {
    if (input.amount.lte(0)) {
      throw new BadRequestException(
        'Reconciliation adjustments require a positive amount.',
      );
    }

    return this.create(
      ownerId,
      {
        postedAt: new Date().toISOString(),
        kind: TransactionKind.ADJUSTMENT,
        amount: input.amount.toNumber(),
        description: 'Account reconciliation adjustment',
        notes: input.notes,
        accountId: input.accountId,
        direction: input.direction,
        categoryId: null,
        counterparty: null,
      },
      client,
    );
  }

  async update(
    ownerId: string,
    id: string,
    dto: UpdateTransactionDto,
  ): Promise<LogicalTransactionEntry> {
    const existing = await this.findOne(ownerId, id);

    if (existing.entryType === 'TRANSFER') {
      if (dto.kind !== TransactionKind.TRANSFER) {
        throw new ConflictException(
          'Transaction kind cannot be changed. Delete and recreate the transaction.',
        );
      }

      const prepared = await this.prepareTransferTransaction(ownerId, dto, {
        sourceAccountId: existing.outflow.accountId,
        destinationAccountId: existing.inflow.accountId,
      });

      await this.prisma.$transaction(async (tx) => {
        await tx.transaction.update({
          where: { id: existing.outflow.id },
          data: {
            postedAt: prepared.postedAt,
            accountId: prepared.sourceAccountId,
            amount: prepared.amount,
            currency: prepared.currency,
            direction: TransactionDirection.OUTFLOW,
            kind: TransactionKind.TRANSFER,
            categoryId: null,
            description: prepared.description,
            notes: prepared.notes,
            counterparty: null,
          },
        });

        await tx.transaction.update({
          where: { id: existing.inflow.id },
          data: {
            postedAt: prepared.postedAt,
            accountId: prepared.destinationAccountId,
            amount: prepared.amount,
            currency: prepared.currency,
            direction: TransactionDirection.INFLOW,
            kind: TransactionKind.TRANSFER,
            categoryId: null,
            description: prepared.description,
            notes: prepared.notes,
            counterparty: null,
          },
        });
      });

      return this.findTransferEntry(ownerId, existing.transferGroupId);
    }

    if (dto.kind === TransactionKind.TRANSFER) {
      throw new ConflictException(
        'Transaction kind cannot be changed. Delete and recreate the transaction.',
      );
    }

    if (dto.kind !== existing.row.kind) {
      throw new ConflictException(
        'Transaction kind cannot be changed. Delete and recreate the transaction.',
      );
    }

    const prepared = await this.prepareStandardTransaction(ownerId, dto, {
      accountId: existing.row.accountId,
      categoryId: existing.row.categoryId,
    });

    const row = await this.prisma.transaction.update({
      where: { id: existing.row.id },
      data: {
        postedAt: prepared.postedAt,
        accountId: prepared.accountId,
        categoryId: prepared.categoryId,
        amount: prepared.amount,
        currency: prepared.currency,
        direction: prepared.direction,
        description: prepared.description,
        notes: prepared.notes,
        counterparty: prepared.counterparty,
      },
      include: {
        account: true,
        category: true,
      },
    });

    return {
      entryType: 'STANDARD',
      row,
    };
  }

  async remove(ownerId: string, id: string): Promise<void> {
    const existing = await this.findOne(ownerId, id);

    if (existing.entryType === 'TRANSFER') {
      await this.prisma.transaction.deleteMany({
        where: {
          userId: ownerId,
          transferGroupId: existing.transferGroupId,
        },
      });
      return;
    }

    await this.prisma.transaction.delete({
      where: { id: existing.row.id },
    });
  }

  async getCashflowSummary(
    ownerId: string,
    filters: CashflowFilters,
  ): Promise<CashflowSummaryResponse> {
    const normalizedRange = this.resolveOptionalBoundedDateRange(
      filters.from,
      filters.to,
    );
    const rows = await this.prisma.transaction.findMany({
      where: {
        userId: ownerId,
        kind: {
          not: TransactionKind.TRANSFER,
        },
        ...(filters.accountId ? { accountId: filters.accountId } : {}),
        ...(filters.categoryId ? { categoryId: filters.categoryId } : {}),
        ...(!(filters.includeArchivedAccounts ?? false)
          ? {
              account: {
                archivedAt: null,
              },
            }
          : {}),
        ...this.toPostedAtWhere(normalizedRange.from, normalizedRange.to),
      },
      include: {
        account: true,
        category: true,
      },
    });

    return this.buildCashflowSummary(rows);
  }

  async getMonthlyCashflow(
    ownerId: string,
    filters: MonthlyCashflowFilters,
  ): Promise<MonthlyCashflowResponse> {
    const range = this.resolveRequiredMonthlyRange(filters.from, filters.to);
    const accountIds = this.normalizeAccountIds(filters.accountIds);
    const includeArchivedAccounts = filters.includeArchivedAccounts ?? false;
    const monthKeys = this.listMonthsInRange(range.from, range.to);
    const postedAt = {
      gte: romeMonthToUtcStart(range.from),
      lt: romeMonthToUtcExclusiveEnd(range.to),
    };

    const [standardRows, transferRows] = await Promise.all([
      this.prisma.transaction.findMany({
        where: {
          userId: ownerId,
          kind: {
            in: [
              TransactionKind.INCOME,
              TransactionKind.EXPENSE,
              TransactionKind.ADJUSTMENT,
            ],
          },
          ...(accountIds ? { accountId: { in: accountIds } } : {}),
          ...(!includeArchivedAccounts
            ? {
                account: {
                  archivedAt: null,
                },
              }
            : {}),
          postedAt,
        },
        include: {
          account: true,
          category: true,
        },
      }),
      this.prisma.transaction.findMany({
        where: {
          userId: ownerId,
          kind: TransactionKind.TRANSFER,
          ...(accountIds ? { accountId: { in: accountIds } } : {}),
          ...(!includeArchivedAccounts
            ? {
                account: {
                  archivedAt: null,
                },
              }
            : {}),
          postedAt,
        },
        include: {
          account: true,
          category: true,
        },
      }),
    ]);

    return this.buildMonthlyCashflow(monthKeys, standardRows, transferRows);
  }

  private async createTransfer(
    ownerId: string,
    dto: CreateTransactionDto,
    client: TransactionWriteClient = this.prisma,
  ): Promise<LogicalTransactionEntry> {
    const prepared = await this.prepareTransferTransaction(ownerId, dto);
    const transferGroupId = `transfer_${randomUUID()}`;

    const persistTransfer = async (
      tx: Prisma.TransactionClient,
    ): Promise<void> => {
      await tx.transaction.create({
        data: {
          userId: ownerId,
          postedAt: prepared.postedAt,
          accountId: prepared.sourceAccountId,
          categoryId: null,
          amount: prepared.amount,
          currency: prepared.currency,
          direction: TransactionDirection.OUTFLOW,
          kind: TransactionKind.TRANSFER,
          description: prepared.description,
          notes: prepared.notes,
          counterparty: null,
          transferGroupId,
        },
      });

      await tx.transaction.create({
        data: {
          userId: ownerId,
          postedAt: prepared.postedAt,
          accountId: prepared.destinationAccountId,
          categoryId: null,
          amount: prepared.amount,
          currency: prepared.currency,
          direction: TransactionDirection.INFLOW,
          kind: TransactionKind.TRANSFER,
          description: prepared.description,
          notes: prepared.notes,
          counterparty: null,
          transferGroupId,
        },
      });
    };

    if (client === this.prisma) {
      await this.prisma.$transaction(persistTransfer);
    } else {
      await persistTransfer(client);
    }

    return this.findTransferEntry(ownerId, transferGroupId, client);
  }

  private async prepareStandardTransaction(
    ownerId: string,
    dto: CreateTransactionDto | UpdateTransactionDto,
    current?: {
      accountId?: string | null;
      categoryId?: string | null;
    },
  ): Promise<PreparedStandardTransactionInput> {
    if (dto.kind === TransactionKind.TRANSFER) {
      throw new BadRequestException(
        'Transfer transactions must use source and destination accounts.',
      );
    }

    if (!dto.accountId) {
      throw new BadRequestException('accountId is required.');
    }

    if (dto.sourceAccountId || dto.destinationAccountId) {
      throw new BadRequestException(
        'sourceAccountId and destinationAccountId are only valid for transfers.',
      );
    }

    if (!dto.direction) {
      throw new BadRequestException('direction is required.');
    }

    if (
      dto.kind === TransactionKind.EXPENSE &&
      dto.direction !== TransactionDirection.OUTFLOW
    ) {
      throw new BadRequestException(
        'Expense transactions must use the OUTFLOW direction.',
      );
    }

    if (
      dto.kind === TransactionKind.INCOME &&
      dto.direction !== TransactionDirection.INFLOW
    ) {
      throw new BadRequestException(
        'Income transactions must use the INFLOW direction.',
      );
    }

    if (dto.kind === TransactionKind.ADJUSTMENT && dto.categoryId) {
      throw new BadRequestException(
        'Adjustment transactions cannot be assigned to categories.',
      );
    }

    const account = await this.accountsService.getAssignableAccount(
      ownerId,
      dto.accountId,
      current?.accountId,
    );

    let categoryId: string | null = null;
    if (dto.categoryId) {
      const category = await this.categoriesService.getAssignableCategory(
        ownerId,
        dto.categoryId,
        dto.kind,
        current?.categoryId,
      );
      categoryId = category.id;
    }

    const postedAt = this.parsePostedAt(dto.postedAt);
    this.assertPostedAtAllowedForAccount(account, postedAt);

    return {
      postedAt,
      amount: this.toDecimal(dto.amount),
      currency: account.currency,
      kind: dto.kind,
      direction: dto.direction,
      accountId: account.id,
      categoryId,
      description: this.requireText(
        dto.description,
        'Description is required.',
      ),
      notes: this.optionalText(dto.notes),
      counterparty: this.optionalText(dto.counterparty),
    };
  }

  private async prepareTransferTransaction(
    ownerId: string,
    dto: CreateTransactionDto | UpdateTransactionDto,
    current?: {
      sourceAccountId?: string | null;
      destinationAccountId?: string | null;
    },
  ): Promise<PreparedTransferTransactionInput> {
    if (dto.kind !== TransactionKind.TRANSFER) {
      throw new BadRequestException(
        'Only transfer transactions may use source and destination accounts.',
      );
    }

    if (!dto.sourceAccountId || !dto.destinationAccountId) {
      throw new BadRequestException(
        'sourceAccountId and destinationAccountId are required for transfers.',
      );
    }

    if (dto.accountId || dto.direction || dto.categoryId || dto.counterparty) {
      throw new BadRequestException(
        'Transfers must omit accountId, direction, categoryId, and counterparty.',
      );
    }

    if (dto.sourceAccountId === dto.destinationAccountId) {
      throw new BadRequestException(
        'sourceAccountId and destinationAccountId must be different.',
      );
    }

    const sourceAccount = await this.accountsService.getAssignableAccount(
      ownerId,
      dto.sourceAccountId,
      current?.sourceAccountId,
    );
    const destinationAccount = await this.accountsService.getAssignableAccount(
      ownerId,
      dto.destinationAccountId,
      current?.destinationAccountId,
    );

    if (sourceAccount.currency !== destinationAccount.currency) {
      throw new BadRequestException(
        'Transfers require source and destination accounts with the same currency.',
      );
    }

    const postedAt = this.parsePostedAt(dto.postedAt);
    this.assertPostedAtAllowedForAccount(sourceAccount, postedAt);
    this.assertPostedAtAllowedForAccount(destinationAccount, postedAt);

    return {
      postedAt,
      amount: this.toDecimal(dto.amount),
      currency: sourceAccount.currency,
      description: this.requireText(
        dto.description,
        'Description is required.',
      ),
      notes: this.optionalText(dto.notes),
      sourceAccountId: sourceAccount.id,
      destinationAccountId: destinationAccount.id,
    };
  }

  private async findRows(
    ownerId: string,
    filters: TransactionFilters,
  ): Promise<TransactionRecord[]> {
    return this.prisma.transaction.findMany({
      where: {
        userId: ownerId,
        ...(filters.kind ? { kind: filters.kind } : {}),
        ...(filters.categoryId ? { categoryId: filters.categoryId } : {}),
        ...this.toPostedAtWhere(filters.from, filters.to),
      },
      include: {
        account: true,
        category: true,
      },
    });
  }

  private async findTransferEntry(
    ownerId: string,
    transferGroupId: string,
    client: TransactionWriteClient = this.prisma,
  ): Promise<LogicalTransactionEntry> {
    const rows = await client.transaction.findMany({
      where: {
        userId: ownerId,
        transferGroupId,
      },
      include: {
        account: true,
        category: true,
      },
    });

    if (rows.length === 0) {
      throw new NotFoundException(
        `Transaction ${transferGroupId} was not found.`,
      );
    }

    return this.toTransferEntry(transferGroupId, rows);
  }

  private toLogicalEntries(
    rows: TransactionRecord[],
  ): LogicalTransactionEntry[] {
    const entries: LogicalTransactionEntry[] = [];
    const transferGroups = new Map<string, TransactionRecord[]>();

    for (const row of rows) {
      if (row.kind === TransactionKind.TRANSFER && row.transferGroupId) {
        const group = transferGroups.get(row.transferGroupId) ?? [];
        group.push(row);
        transferGroups.set(row.transferGroupId, group);
        continue;
      }

      entries.push({
        entryType: 'STANDARD',
        row,
      });
    }

    for (const [transferGroupId, groupRows] of transferGroups.entries()) {
      entries.push(this.toTransferEntry(transferGroupId, groupRows));
    }

    return entries;
  }

  private toTransferEntry(
    transferGroupId: string,
    rows: TransactionRecord[],
  ): LogicalTransactionEntry {
    if (rows.length !== 2) {
      throw new ConflictException(
        `Transfer ${transferGroupId} is incomplete and cannot be represented.`,
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
        `Transfer ${transferGroupId} is missing one direction.`,
      );
    }

    return {
      entryType: 'TRANSFER',
      transferGroupId,
      outflow,
      inflow,
    };
  }

  private matchesFilters(
    entry: LogicalTransactionEntry,
    filters: TransactionFilters,
  ): boolean {
    if (
      !(filters.includeArchivedAccounts ?? false) &&
      this.entryUsesArchivedAccount(entry)
    ) {
      return false;
    }

    if (filters.kind && this.getEntryKind(entry) !== filters.kind) {
      return false;
    }

    if (
      filters.accountId &&
      !this.entryMatchesAccount(entry, filters.accountId)
    ) {
      return false;
    }

    if (filters.categoryId) {
      return (
        entry.entryType === 'STANDARD' &&
        entry.row.categoryId === filters.categoryId
      );
    }

    return true;
  }

  private normalizeTransactionFilters(
    filters: TransactionFilters,
  ): TransactionFilters {
    const range = this.resolveOptionalBoundedDateRange(
      filters.from,
      filters.to,
    );
    const paginationRequested =
      filters.limit !== undefined || filters.offset !== undefined;

    return {
      ...filters,
      from: range.from,
      to: range.to,
      limit: paginationRequested
        ? this.normalizeLimit(filters.limit)
        : undefined,
      offset: paginationRequested
        ? this.normalizeOffset(filters.offset)
        : undefined,
    };
  }

  private normalizeLimit(limit?: number): number {
    if (limit === undefined) {
      return DEFAULT_TRANSACTION_LIMIT;
    }

    return Math.min(Math.max(limit, 1), MAX_TRANSACTION_LIMIT);
  }

  private normalizeOffset(offset?: number): number {
    if (offset === undefined) {
      return DEFAULT_TRANSACTION_OFFSET;
    }

    return Math.max(offset, DEFAULT_TRANSACTION_OFFSET);
  }

  private resolveOptionalBoundedDateRange(
    from?: string,
    to?: string,
  ): { from?: string; to?: string } {
    if (from === undefined && to === undefined) {
      return {};
    }

    return this.resolveBoundedDateRange(from, to);
  }

  private resolveBoundedDateRange(
    from?: string,
    to?: string,
  ): { from: string; to: string } {
    const today = this.getTodayRomeDateString();
    const effectiveTo = to ?? today;
    const effectiveFrom =
      from ??
      this.addDaysToLocalDate(effectiveTo, -(MAX_TRANSACTION_RANGE_DAYS - 1));

    if (effectiveFrom > effectiveTo) {
      throw new BadRequestException('from must be less than or equal to to.');
    }

    const daySpan = this.diffLocalDays(effectiveFrom, effectiveTo) + 1;
    if (daySpan > MAX_TRANSACTION_RANGE_DAYS) {
      throw new BadRequestException(
        `Date range cannot exceed ${MAX_TRANSACTION_RANGE_DAYS} days.`,
      );
    }

    return {
      from: effectiveFrom,
      to: effectiveTo,
    };
  }

  private getTodayRomeDateString(): string {
    const parts = ROME_DATE_FORMATTER.formatToParts(new Date());
    const year = parts.find((part) => part.type === 'year')?.value;
    const month = parts.find((part) => part.type === 'month')?.value;
    const day = parts.find((part) => part.type === 'day')?.value;

    if (!year || !month || !day) {
      throw new Error('Unable to resolve the current Europe/Rome date.');
    }

    return `${year}-${month}-${day}`;
  }

  private addDaysToLocalDate(dateString: string, amount: number): string {
    const { year, month, day } = this.parseLocalDate(dateString);
    const next = new Date(Date.UTC(year, month - 1, day + amount));

    return [
      next.getUTCFullYear(),
      String(next.getUTCMonth() + 1).padStart(2, '0'),
      String(next.getUTCDate()).padStart(2, '0'),
    ].join('-');
  }

  private diffLocalDays(from: string, to: string): number {
    const fromDate = this.localDateToUtcEpoch(from);
    const toDate = this.localDateToUtcEpoch(to);

    return Math.floor((toDate - fromDate) / 86_400_000);
  }

  private localDateToUtcEpoch(dateString: string): number {
    const { year, month, day } = this.parseLocalDate(dateString);
    return Date.UTC(year, month - 1, day);
  }

  private parseLocalDate(dateString: string): {
    year: number;
    month: number;
    day: number;
  } {
    const [year, month, day] = dateString.split('-').map(Number);

    if (!year || !month || !day) {
      throw new BadRequestException(`Invalid local date ${dateString}.`);
    }

    return {
      year,
      month,
      day,
    };
  }

  private resolveRequiredMonthlyRange(
    from?: string,
    to?: string,
  ): { from: string; to: string } {
    if (!from || !to) {
      throw new BadRequestException('from and to are required.');
    }

    if (!LOCAL_MONTH_PATTERN.test(from) || !LOCAL_MONTH_PATTERN.test(to)) {
      throw new BadRequestException('from and to must use the YYYY-MM format.');
    }

    if (from > to) {
      throw new BadRequestException('from must be less than or equal to to.');
    }

    const monthSpan = diffRomeMonths(from, to) + 1;
    if (monthSpan > MAX_MONTHLY_CASHFLOW_RANGE_MONTHS) {
      throw new BadRequestException(
        `Monthly cashflow range cannot exceed ${MAX_MONTHLY_CASHFLOW_RANGE_MONTHS} months.`,
      );
    }

    return { from, to };
  }

  private listMonthsInRange(from: string, to: string): string[] {
    const monthCount = diffRomeMonths(from, to) + 1;

    return Array.from({ length: monthCount }, (_, index) =>
      addMonthsToRomeMonth(from, index),
    );
  }

  private normalizeAccountIds(accountIds?: string[]): string[] | undefined {
    if (!accountIds || accountIds.length === 0) {
      return undefined;
    }

    const normalized = Array.from(
      new Set(accountIds.map((accountId) => accountId.trim()).filter(Boolean)),
    );

    return normalized.length > 0 ? normalized : undefined;
  }

  private entryUsesArchivedAccount(entry: LogicalTransactionEntry): boolean {
    if (entry.entryType === 'STANDARD') {
      return entry.row.account.archivedAt !== null;
    }

    return (
      entry.outflow.account.archivedAt !== null ||
      entry.inflow.account.archivedAt !== null
    );
  }

  private entryMatchesAccount(
    entry: LogicalTransactionEntry,
    accountId: string,
  ): boolean {
    if (entry.entryType === 'STANDARD') {
      return entry.row.accountId === accountId;
    }

    return (
      entry.outflow.accountId === accountId ||
      entry.inflow.accountId === accountId
    );
  }

  private getEntryKind(entry: LogicalTransactionEntry): TransactionKind {
    return entry.entryType === 'STANDARD'
      ? entry.row.kind
      : TransactionKind.TRANSFER;
  }

  private compareEntriesDesc(
    left: LogicalTransactionEntry,
    right: LogicalTransactionEntry,
  ): number {
    const postedAtDiff =
      this.getEntryPostedAt(right).getTime() -
      this.getEntryPostedAt(left).getTime();

    if (postedAtDiff !== 0) {
      return postedAtDiff;
    }

    const updatedAtDiff =
      this.getEntryUpdatedAt(right).getTime() -
      this.getEntryUpdatedAt(left).getTime();

    if (updatedAtDiff !== 0) {
      return updatedAtDiff;
    }

    return this.getEntryId(left).localeCompare(this.getEntryId(right));
  }

  private getEntryPostedAt(entry: LogicalTransactionEntry): Date {
    return entry.entryType === 'STANDARD'
      ? entry.row.postedAt
      : entry.outflow.postedAt;
  }

  private getEntryUpdatedAt(entry: LogicalTransactionEntry): Date {
    if (entry.entryType === 'STANDARD') {
      return entry.row.updatedAt;
    }

    return entry.outflow.updatedAt.getTime() >= entry.inflow.updatedAt.getTime()
      ? entry.outflow.updatedAt
      : entry.inflow.updatedAt;
  }

  private getEntryId(entry: LogicalTransactionEntry): string {
    return entry.entryType === 'STANDARD'
      ? entry.row.id
      : entry.transferGroupId;
  }

  private buildMonthlyCashflow(
    monthKeys: string[],
    standardRows: TransactionRecord[],
    transferRows: TransactionRecord[],
  ): MonthlyCashflowResponse {
    type CategoryAccumulator = {
      categoryId: string | null;
      name: string;
      total: Prisma.Decimal;
    };
    type MonthAccumulator = {
      incomeTotal: Prisma.Decimal;
      expenseTotal: Prisma.Decimal;
      adjustmentInTotal: Prisma.Decimal;
      adjustmentOutTotal: Prisma.Decimal;
      transferTotalExcluded: Prisma.Decimal;
      uncategorizedExpenseTotal: Prisma.Decimal;
      uncategorizedIncomeTotal: Prisma.Decimal;
      expenseCategories: Map<string, CategoryAccumulator>;
      incomeCategories: Map<string, CategoryAccumulator>;
    };
    type CurrencyAccumulator = {
      currency: string;
      totalExpense: Prisma.Decimal;
      rangeExpenseCategories: Map<string, CategoryAccumulator>;
      months: Map<string, MonthAccumulator>;
    };

    const currencies = new Map<string, CurrencyAccumulator>();

    const createMonthAccumulator = (): MonthAccumulator => ({
      incomeTotal: this.toDecimal(0),
      expenseTotal: this.toDecimal(0),
      adjustmentInTotal: this.toDecimal(0),
      adjustmentOutTotal: this.toDecimal(0),
      transferTotalExcluded: this.toDecimal(0),
      uncategorizedExpenseTotal: this.toDecimal(0),
      uncategorizedIncomeTotal: this.toDecimal(0),
      expenseCategories: new Map<string, CategoryAccumulator>(),
      incomeCategories: new Map<string, CategoryAccumulator>(),
    });

    const ensureCurrency = (currency: string): CurrencyAccumulator => {
      const existing = currencies.get(currency);
      if (existing) {
        return existing;
      }

      const created: CurrencyAccumulator = {
        currency,
        totalExpense: this.toDecimal(0),
        rangeExpenseCategories: new Map<string, CategoryAccumulator>(),
        months: new Map(
          monthKeys.map((month) => [month, createMonthAccumulator()]),
        ),
      };
      currencies.set(currency, created);
      return created;
    };

    for (const row of standardRows) {
      const month = utcDateToRomeMonth(row.postedAt);
      const currency = ensureCurrency(row.currency);
      const totals = currency.months.get(month);

      if (!totals) {
        continue;
      }

      if (row.kind === TransactionKind.INCOME) {
        totals.incomeTotal = totals.incomeTotal.plus(row.amount);

        if (row.categoryId === null) {
          totals.uncategorizedIncomeTotal =
            totals.uncategorizedIncomeTotal.plus(row.amount);
        }

        this.addMonthlyCategoryTotal(
          totals.incomeCategories,
          row.categoryId,
          row.category?.name ?? 'Uncategorized',
          row.amount,
        );
        continue;
      }

      if (row.kind === TransactionKind.EXPENSE) {
        totals.expenseTotal = totals.expenseTotal.plus(row.amount);
        currency.totalExpense = currency.totalExpense.plus(row.amount);

        if (row.categoryId === null) {
          totals.uncategorizedExpenseTotal =
            totals.uncategorizedExpenseTotal.plus(row.amount);
        }

        this.addMonthlyCategoryTotal(
          totals.expenseCategories,
          row.categoryId,
          row.category?.name ?? 'Uncategorized',
          row.amount,
        );
        this.addMonthlyCategoryTotal(
          currency.rangeExpenseCategories,
          row.categoryId,
          row.category?.name ?? 'Uncategorized',
          row.amount,
        );
        continue;
      }

      if (row.direction === TransactionDirection.INFLOW) {
        totals.adjustmentInTotal = totals.adjustmentInTotal.plus(row.amount);
      } else {
        totals.adjustmentOutTotal = totals.adjustmentOutTotal.plus(row.amount);
      }
    }

    for (const transfer of this.toMonthlyTransferRows(transferRows)) {
      const month = utcDateToRomeMonth(transfer.postedAt);
      const currency = ensureCurrency(transfer.currency);
      const totals = currency.months.get(month);

      if (!totals) {
        continue;
      }

      totals.transferTotalExcluded = totals.transferTotalExcluded.plus(
        transfer.amount,
      );
    }

    return Array.from(currencies.values())
      .map(
        (currency): MonthlyCashflowCurrencyResponse => ({
          currency: currency.currency,
          averageMonthlyExpense:
            monthKeys.length === 0
              ? 0
              : currency.totalExpense.toNumber() / monthKeys.length,
          rangeExpenseCategories: this.sortMonthlyCategoryTotals(
            currency.rangeExpenseCategories,
          ),
          months: monthKeys.map((month) =>
            this.toMonthlyCashflowMonthResponse(
              month,
              currency.months.get(month) ?? createMonthAccumulator(),
            ),
          ),
        }),
      )
      .sort((left, right) => left.currency.localeCompare(right.currency));
  }

  private buildCashflowSummary(
    rows: TransactionRecord[],
  ): CashflowSummaryResponse {
    type CategoryCashflowTotal = {
      categoryId: string | null;
      name: string;
      type: CategoryType;
      total: Prisma.Decimal;
    };
    type AccountCashflowTotal = {
      accountId: string;
      name: string;
      inflowTotal: Prisma.Decimal;
      outflowTotal: Prisma.Decimal;
    };
    type CashflowBucket = {
      summary: CashflowCurrencySummaryResponse;
      categoryTotals: Map<string, CategoryCashflowTotal>;
      accountTotals: Map<string, AccountCashflowTotal>;
    };

    const buckets = new Map<string, CashflowBucket>();

    for (const row of rows) {
      const bucket: CashflowBucket = buckets.get(row.currency) ?? {
        summary: {
          currency: row.currency,
          incomeTotal: 0,
          expenseTotal: 0,
          adjustmentInTotal: 0,
          adjustmentOutTotal: 0,
          netCashflow: 0,
          byCategory: [],
          byAccount: [],
        },
        categoryTotals: new Map<string, CategoryCashflowTotal>(),
        accountTotals: new Map<string, AccountCashflowTotal>(),
      };

      const amount = row.amount;
      const accountTotal = bucket.accountTotals.get(row.accountId) ?? {
        accountId: row.accountId,
        name: row.account.name,
        inflowTotal: this.toDecimal(0),
        outflowTotal: this.toDecimal(0),
      };

      if (row.direction === TransactionDirection.INFLOW) {
        accountTotal.inflowTotal = accountTotal.inflowTotal.plus(amount);
      } else {
        accountTotal.outflowTotal = accountTotal.outflowTotal.plus(amount);
      }

      bucket.accountTotals.set(row.accountId, accountTotal);

      if (row.kind === TransactionKind.INCOME) {
        bucket.summary.incomeTotal += amount.toNumber();
      } else if (row.kind === TransactionKind.EXPENSE) {
        bucket.summary.expenseTotal += amount.toNumber();
      } else if (row.direction === TransactionDirection.INFLOW) {
        bucket.summary.adjustmentInTotal += amount.toNumber();
      } else {
        bucket.summary.adjustmentOutTotal += amount.toNumber();
      }

      if (
        row.kind === TransactionKind.INCOME ||
        row.kind === TransactionKind.EXPENSE
      ) {
        const categoryType =
          row.kind === TransactionKind.INCOME
            ? CategoryType.INCOME
            : CategoryType.EXPENSE;
        const categoryKey = row.categoryId
          ? `category:${row.categoryId}`
          : `uncategorized:${categoryType}`;
        const categoryTotal = bucket.categoryTotals.get(categoryKey) ?? {
          categoryId: row.categoryId,
          name: row.category?.name ?? 'Uncategorized',
          type: row.category?.type ?? categoryType,
          total: this.toDecimal(0),
        };

        categoryTotal.total = categoryTotal.total.plus(amount);
        bucket.categoryTotals.set(categoryKey, categoryTotal);
      }

      buckets.set(row.currency, bucket);
    }

    return Array.from(buckets.values())
      .map((bucket) => {
        bucket.summary.netCashflow =
          bucket.summary.incomeTotal +
          bucket.summary.adjustmentInTotal -
          bucket.summary.expenseTotal -
          bucket.summary.adjustmentOutTotal;
        bucket.summary.byCategory = Array.from(bucket.categoryTotals.values())
          .map((categoryTotal) => ({
            categoryId: categoryTotal.categoryId,
            name: categoryTotal.name,
            type: categoryTotal.type,
            total: categoryTotal.total.toNumber(),
          }))
          .sort((left, right) => {
            if (left.type !== right.type) {
              return left.type.localeCompare(right.type);
            }

            if (right.total !== left.total) {
              return right.total - left.total;
            }

            return left.name.localeCompare(right.name);
          });
        bucket.summary.byAccount = Array.from(bucket.accountTotals.values())
          .map((accountTotal) => ({
            accountId: accountTotal.accountId,
            name: accountTotal.name,
            inflowTotal: accountTotal.inflowTotal.toNumber(),
            outflowTotal: accountTotal.outflowTotal.toNumber(),
            netCashflow: accountTotal.inflowTotal
              .minus(accountTotal.outflowTotal)
              .toNumber(),
          }))
          .sort((left, right) => left.name.localeCompare(right.name));

        return bucket.summary;
      })
      .sort((left, right) => left.currency.localeCompare(right.currency));
  }

  private toMonthlyTransferRows(rows: TransactionRecord[]): Array<{
    postedAt: Date;
    currency: string;
    amount: Prisma.Decimal;
  }> {
    const transferGroups = new Map<string, TransactionRecord[]>();

    for (const row of rows) {
      const key = row.transferGroupId ?? row.id;
      const group = transferGroups.get(key) ?? [];
      group.push(row);
      transferGroups.set(key, group);
    }

    return Array.from(transferGroups.values()).flatMap((group) => {
      if (group.length !== 2) {
        return [];
      }

      const outflow = group.find(
        (row) => row.direction === TransactionDirection.OUTFLOW,
      );
      const inflow = group.find(
        (row) => row.direction === TransactionDirection.INFLOW,
      );

      if (!outflow || !inflow) {
        return [];
      }

      return [
        {
          postedAt: outflow.postedAt,
          currency: outflow.currency,
          amount: outflow.amount,
        },
      ];
    });
  }

  private addMonthlyCategoryTotal(
    totals: Map<
      string,
      {
        categoryId: string | null;
        name: string;
        total: Prisma.Decimal;
      }
    >,
    categoryId: string | null,
    name: string,
    amount: Prisma.Decimal,
  ): void {
    const key = categoryId ?? 'uncategorized';
    const existing = totals.get(key) ?? {
      categoryId,
      name,
      total: this.toDecimal(0),
    };

    existing.total = existing.total.plus(amount);
    totals.set(key, existing);
  }

  private sortMonthlyCategoryTotals(
    totals: Map<
      string,
      {
        categoryId: string | null;
        name: string;
        total: Prisma.Decimal;
      }
    >,
  ): MonthlyCashflowCategoryTotalResponse[] {
    return Array.from(totals.values())
      .map((total) => ({
        categoryId: total.categoryId,
        name: total.name,
        total: total.total.toNumber(),
      }))
      .sort((left, right) => {
        if (right.total !== left.total) {
          return right.total - left.total;
        }

        return left.name.localeCompare(right.name);
      });
  }

  private toMonthlyCashflowMonthResponse(
    month: string,
    totals: {
      incomeTotal: Prisma.Decimal;
      expenseTotal: Prisma.Decimal;
      adjustmentInTotal: Prisma.Decimal;
      adjustmentOutTotal: Prisma.Decimal;
      transferTotalExcluded: Prisma.Decimal;
      uncategorizedExpenseTotal: Prisma.Decimal;
      uncategorizedIncomeTotal: Prisma.Decimal;
      expenseCategories: Map<
        string,
        {
          categoryId: string | null;
          name: string;
          total: Prisma.Decimal;
        }
      >;
      incomeCategories: Map<
        string,
        {
          categoryId: string | null;
          name: string;
          total: Prisma.Decimal;
        }
      >;
    },
  ): MonthlyCashflowMonthResponse {
    const netCashflow = totals.incomeTotal.minus(totals.expenseTotal);

    return {
      month,
      incomeTotal: totals.incomeTotal.toNumber(),
      expenseTotal: totals.expenseTotal.toNumber(),
      netCashflow: netCashflow.toNumber(),
      adjustmentInTotal: totals.adjustmentInTotal.toNumber(),
      adjustmentOutTotal: totals.adjustmentOutTotal.toNumber(),
      transferTotalExcluded: totals.transferTotalExcluded.toNumber(),
      uncategorizedExpenseTotal: totals.uncategorizedExpenseTotal.toNumber(),
      uncategorizedIncomeTotal: totals.uncategorizedIncomeTotal.toNumber(),
      savingsRate: totals.incomeTotal.equals(this.toDecimal(0))
        ? null
        : netCashflow.div(totals.incomeTotal).toNumber(),
      expenseCategories: this.sortMonthlyCategoryTotals(
        totals.expenseCategories,
      ),
      incomeCategories: this.sortMonthlyCategoryTotals(totals.incomeCategories),
    };
  }

  private toPostedAtWhere(
    from?: string,
    to?: string,
  ): Pick<Prisma.TransactionWhereInput, 'postedAt'> {
    const postedAt: Prisma.DateTimeFilter = {};

    if (from) {
      postedAt.gte = romeDateToUtcStart(from);
    }

    if (to) {
      postedAt.lt = romeDateToUtcExclusiveEnd(to);
    }

    return Object.keys(postedAt).length > 0 ? { postedAt } : {};
  }

  private parsePostedAt(value: string): Date {
    const postedAt = new Date(value);

    if (Number.isNaN(postedAt.getTime())) {
      throw new BadRequestException(`Invalid postedAt value ${value}.`);
    }

    return postedAt;
  }

  private assertPostedAtAllowedForAccount(
    account: Account,
    postedAt: Date,
  ): void {
    if (!account.openingBalanceDate) {
      return;
    }

    const openingBalanceDate = account.openingBalanceDate
      .toISOString()
      .slice(0, 10);
    const cutoff = romeDateToUtcStart(openingBalanceDate);

    if (postedAt < cutoff) {
      throw new BadRequestException(
        `Transactions before ${openingBalanceDate} are not allowed for account ${account.name}.`,
      );
    }
  }

  private requireText(value: string, errorMessage: string): string {
    const normalized = value.trim();

    if (!normalized) {
      throw new BadRequestException(errorMessage);
    }

    return normalized;
  }

  private optionalText(value?: string | null): string | null {
    const normalized = value?.trim();
    return normalized ? normalized : null;
  }

  private toDecimal(value: number): Prisma.Decimal {
    return new Prisma.Decimal(value.toString());
  }
}
