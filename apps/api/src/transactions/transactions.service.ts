import {
  forwardRef,
  Inject,
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { AccountsService } from '@accounts/accounts.service';
import { PricesService } from '@prices/prices.service';
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
  AccountType,
  AssetKind,
  AssetType,
  CategoryType,
  FxRateSource,
  LiabilityKind,
  Prisma,
  TransactionDirection,
  TransactionKind,
} from '@finhance/db';
import type {
  CashflowAnalyticsBreakdownItemResponse,
  CashflowAnalyticsCategoryTrendResponse,
  CashflowAnalyticsCurrencyResponse,
  CashflowAnalyticsMonthOverMonthChangeResponse,
  CashflowAnalyticsMonthPointResponse,
  CashflowAnalyticsResponse,
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
import {
  getCategoryHierarchyMetadata,
  normalizeExpenseValidationEntry,
} from '@transactions/category-hierarchy';

const DEFAULT_TRANSACTION_LIMIT = 200;
const MAX_TRANSACTION_LIMIT = 500;
const DEFAULT_TRANSACTION_OFFSET = 0;
const MAX_TRANSACTION_RANGE_DAYS = 3_650;
const MAX_MONTHLY_CASHFLOW_RANGE_MONTHS = 24;
const ANALYTICS_BREAKDOWN_LIMIT = 8;
const ANALYTICS_TREND_LIMIT = 5;
const ANALYTICS_DELTA_LIMIT = 5;
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
  nativeAmount: Prisma.Decimal | null;
  nativeCurrency: string | null;
  fxRateUsed: Prisma.Decimal | null;
  fxRateSource: FxRateSource | null;
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
  sourceAmount: Prisma.Decimal;
  destinationAmount: Prisma.Decimal;
  sourceCurrency: string;
  destinationCurrency: string;
  fxRateUsed: Prisma.Decimal | null;
  fxRateSource: FxRateSource | null;
  description: string;
  notes: string | null;
  sourceAccountId: string;
  destinationAccountId: string;
}

interface PreparedSplitFundingLegInput {
  accountId: string;
  amount: Prisma.Decimal;
}

interface PreparedSplitTransactionInput {
  postedAt: Date;
  amount: Prisma.Decimal;
  currency: string;
  categoryId: string;
  description: string;
  notes: string | null;
  counterparty: string | null;
  fundingLegs: PreparedSplitFundingLegInput[];
}

interface CashflowAnalyticsFilters {
  from: string;
  to: string;
  accountId?: string;
  categoryId?: string;
  primaryCategoryId?: string;
  secondaryCategoryId?: string;
  includeArchivedAccounts?: boolean;
}

type TransactionWriteClient = PrismaService | Prisma.TransactionClient;

@Injectable()
export class TransactionsService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => AccountsService))
    private readonly accountsService: AccountsService,
    private readonly categoriesService: CategoriesService,
    private readonly pricesService: PricesService,
  ) {}

  private runSerializableTransaction<T>(
    callback: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    return this.prisma.$transaction(callback, {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    });
  }

  async findAll(
    ownerId: string,
    filters: TransactionFilters,
  ): Promise<LogicalTransactionEntry[]> {
    const normalizedFilters = this.normalizeTransactionFilters(filters);
    const offset = normalizedFilters.offset ?? DEFAULT_TRANSACTION_OFFSET;
    const limit = normalizedFilters.limit ?? DEFAULT_TRANSACTION_LIMIT;
    const requestedEntryCount = offset + limit;
    const batchSize = Math.min(
      MAX_TRANSACTION_LIMIT,
      Math.max(50, requestedEntryCount * 2),
    );
    const entries: LogicalTransactionEntry[] = [];
    const seenEntryKeys = new Set<string>();
    let rawOffset = 0;

    while (entries.length < requestedEntryCount) {
      const rows = await this.findRows(ownerId, normalizedFilters, {
        skip: rawOffset,
        take: batchSize,
      });

      if (rows.length === 0) {
        break;
      }

      rawOffset += rows.length;
      const completeRows = await this.hydrateLogicalEntryRows(ownerId, rows);
      const batchEntries = this.toLogicalEntries(completeRows)
        .filter((entry) => this.matchesFilters(entry, normalizedFilters))
        .sort((left, right) => this.compareEntriesDesc(left, right));

      for (const entry of batchEntries) {
        const entryKey = `${entry.entryType}:${this.getEntryId(entry)}`;
        if (seenEntryKeys.has(entryKey)) {
          continue;
        }

        seenEntryKeys.add(entryKey);
        entries.push(entry);

        if (entries.length === requestedEntryCount) {
          break;
        }
      }

      if (rows.length < batchSize) {
        break;
      }
    }

    return entries
      .sort((left, right) => this.compareEntriesDesc(left, right))
      .slice(offset, offset + limit);
  }

  async findRecentByAccount(
    ownerId: string,
    accountId: string,
    options: {
      includeArchivedAccounts?: boolean;
      limit?: number;
    } = {},
  ): Promise<LogicalTransactionEntry[]> {
    const limit = this.normalizeLimit(
      options.limit ?? DEFAULT_TRANSACTION_LIMIT,
    );
    const includeArchivedAccounts = options.includeArchivedAccounts ?? false;
    const batchSize = Math.min(MAX_TRANSACTION_LIMIT, Math.max(limit * 2, 50));
    const entries: LogicalTransactionEntry[] = [];
    const seenEntryKeys = new Set<string>();
    const seenTransferGroupIds = new Set<string>();
    let skip = 0;

    while (entries.length < limit) {
      const accountRows = await this.prisma.transaction.findMany({
        where: {
          userId: ownerId,
          accountId,
          ...(!includeArchivedAccounts
            ? {
                account: {
                  archivedAt: null,
                },
              }
            : {}),
        },
        include: {
          account: true,
          category: {
            include: {
              parentCategory: true,
            },
          },
        },
        orderBy: [{ postedAt: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
        take: batchSize,
        skip,
      });

      if (accountRows.length === 0) {
        break;
      }

      skip += accountRows.length;

      const transferGroupIds = [
        ...new Set(
          accountRows
            .filter(
              (row) =>
                row.kind === TransactionKind.TRANSFER &&
                row.transferGroupId &&
                !seenTransferGroupIds.has(row.transferGroupId),
            )
            .map((row) => row.transferGroupId as string),
        ),
      ];
      const splitGroupIds = [
        ...new Set(
          accountRows
            .filter(
              (row) =>
                row.splitGroupId &&
                !seenEntryKeys.has(`SPLIT:${row.splitGroupId}`),
            )
            .map((row) => row.splitGroupId as string),
        ),
      ];

      for (const transferGroupId of transferGroupIds) {
        seenTransferGroupIds.add(transferGroupId);
      }

      const counterpartRows =
        transferGroupIds.length === 0 && splitGroupIds.length === 0
          ? []
          : await this.prisma.transaction.findMany({
              where: {
                userId: ownerId,
                OR: [
                  ...(transferGroupIds.length > 0
                    ? [
                        {
                          transferGroupId: { in: transferGroupIds },
                          accountId: { not: accountId },
                        },
                      ]
                    : []),
                  ...(splitGroupIds.length > 0
                    ? [
                        {
                          splitGroupId: { in: splitGroupIds },
                          accountId: { not: accountId },
                        },
                      ]
                    : []),
                ],
              },
              include: {
                account: true,
                category: {
                  include: {
                    parentCategory: true,
                  },
                },
              },
            });

      const batchEntries = this.toLogicalEntries([
        ...accountRows,
        ...counterpartRows,
      ])
        .filter((entry) =>
          this.matchesFilters(entry, {
            accountId,
            includeArchivedAccounts,
          }),
        )
        .sort((left, right) => this.compareEntriesDesc(left, right));

      for (const entry of batchEntries) {
        const entryKey =
          entry.entryType === 'TRANSFER'
            ? `TRANSFER:${entry.transferGroupId}`
            : entry.entryType === 'SPLIT'
              ? `SPLIT:${entry.splitGroupId}`
              : `STANDARD:${entry.row.id}`;

        if (seenEntryKeys.has(entryKey)) {
          continue;
        }

        seenEntryKeys.add(entryKey);
        entries.push(entry);

        if (entries.length === limit) {
          break;
        }
      }

      if (accountRows.length < batchSize) {
        break;
      }
    }

    return entries
      .sort((left, right) => this.compareEntriesDesc(left, right))
      .slice(0, limit);
  }

  async findOne(ownerId: string, id: string): Promise<LogicalTransactionEntry> {
    const byId = await this.prisma.transaction.findFirst({
      where: { id, userId: ownerId },
      include: {
        account: true,
        category: {
          include: {
            parentCategory: true,
          },
        },
      },
    });

    if (byId) {
      if (byId.kind !== TransactionKind.TRANSFER) {
        if (byId.splitGroupId) {
          return this.findSplitEntry(ownerId, byId.splitGroupId);
        }

        return {
          entryType: 'STANDARD',
          row: byId,
        };
      }

      return this.findTransferEntry(ownerId, byId.transferGroupId ?? id);
    }

    const groupedRows = await this.prisma.transaction.findMany({
      where: {
        userId: ownerId,
        OR: [{ transferGroupId: id }, { splitGroupId: id }],
      },
      include: {
        account: true,
        category: {
          include: {
            parentCategory: true,
          },
        },
      },
    });

    if (groupedRows.some((row) => row.transferGroupId === id)) {
      return this.toTransferEntry(
        id,
        groupedRows.filter((row) => row.transferGroupId === id),
      );
    }

    if (groupedRows.some((row) => row.splitGroupId === id)) {
      return this.toSplitEntry(
        id,
        groupedRows.filter((row) => row.splitGroupId === id),
      );
    }

    throw new NotFoundException(`Transaction ${id} was not found.`);
  }

  async create(
    ownerId: string,
    dto: CreateTransactionDto,
    client: TransactionWriteClient = this.prisma,
  ): Promise<LogicalTransactionEntry> {
    if (dto.fundingLegs && dto.fundingLegs.length > 0) {
      return this.createSplitExpense(ownerId, dto, client);
    }

    if (dto.kind === TransactionKind.TRANSFER) {
      return this.createTransfer(ownerId, dto, client);
    }

    const prepared = await this.prepareStandardTransaction(ownerId, dto);
    const isAdjustment = prepared.kind === TransactionKind.ADJUSTMENT;

    const persist = async (tx: TransactionWriteClient) => {
      if (!isAdjustment) {
        await this.validateAccountCashBalance(
          ownerId,
          prepared.accountId,
          prepared.amount,
          prepared.direction,
          tx,
        );
      }

      const row = await tx.transaction.create({
        data: {
          userId: ownerId,
          postedAt: prepared.postedAt,
          accountId: prepared.accountId,
          categoryId: prepared.categoryId,
          amount: prepared.amount,
          currency: prepared.currency,
          nativeAmount: prepared.nativeAmount,
          nativeCurrency: prepared.nativeCurrency,
          fxRateUsed: prepared.fxRateUsed,
          fxRateSource: prepared.fxRateSource,
          direction: prepared.direction,
          kind: prepared.kind,
          description: prepared.description,
          notes: prepared.notes,
          counterparty: prepared.counterparty,
          transferGroupId: null,
        },
        include: {
          account: true,
          category: {
            include: {
              parentCategory: true,
            },
          },
        },
      });

      if (!isAdjustment) {
        await this.adjustAccountCashBalance(
          ownerId,
          prepared.accountId,
          prepared.amount,
          prepared.direction,
          tx,
        );
      }

      return row;
    };

    const row =
      client === this.prisma
        ? await this.runSerializableTransaction((tx) => persist(tx))
        : await persist(client);

    return {
      entryType: 'STANDARD',
      row,
    };
  }

  async applyAccountCashMovement(
    ownerId: string,
    accountId: string,
    amount: Prisma.Decimal,
    direction: TransactionDirection,
    client: TransactionWriteClient = this.prisma,
    options?: { skipValidation?: boolean },
  ): Promise<void> {
    return this.adjustAccountCashBalance(
      ownerId,
      accountId,
      amount,
      direction,
      client,
      options,
    );
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
    this.assertEntryIsMutable(existing);
    const mirroredBrokerageOperation =
      existing.entryType === 'STANDARD'
        ? await this.prisma.brokerageOperation.findFirst({
            where: {
              userId: ownerId,
              mirroredTransactionId: existing.row.id,
            },
            select: { id: true, accountId: true },
          })
        : null;

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

      await this.runSerializableTransaction(async (tx) => {
        // Reverse old transfer cash effects (skip validation — reversals)
        await this.adjustAccountCashBalance(
          ownerId,
          existing.outflow.accountId,
          existing.outflow.amount,
          TransactionDirection.INFLOW,
          tx,
          { skipValidation: true },
        );
        await this.adjustAccountCashBalance(
          ownerId,
          existing.inflow.accountId,
          existing.inflow.amount,
          TransactionDirection.OUTFLOW,
          tx,
          { skipValidation: true },
        );

        await this.validateAccountCashBalance(
          ownerId,
          prepared.sourceAccountId,
          prepared.sourceAmount,
          TransactionDirection.OUTFLOW,
          tx,
        );

        await tx.transaction.update({
          where: { id: existing.outflow.id },
          data: {
            postedAt: prepared.postedAt,
            accountId: prepared.sourceAccountId,
            amount: prepared.sourceAmount,
            currency: prepared.sourceCurrency,
            nativeAmount: null,
            nativeCurrency: null,
            fxRateUsed: prepared.fxRateUsed,
            fxRateSource: prepared.fxRateSource,
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
            amount: prepared.destinationAmount,
            currency: prepared.destinationCurrency,
            nativeAmount: null,
            nativeCurrency: null,
            fxRateUsed: prepared.fxRateUsed,
            fxRateSource: prepared.fxRateSource,
            direction: TransactionDirection.INFLOW,
            kind: TransactionKind.TRANSFER,
            categoryId: null,
            description: prepared.description,
            notes: prepared.notes,
            counterparty: null,
          },
        });

        // Apply new transfer cash effects (skip validation — balance was
        // already adjusted by the reversal above)
        await this.adjustAccountCashBalance(
          ownerId,
          prepared.sourceAccountId,
          prepared.sourceAmount,
          TransactionDirection.OUTFLOW,
          tx,
        );
        await this.adjustAccountCashBalance(
          ownerId,
          prepared.destinationAccountId,
          prepared.destinationAmount,
          TransactionDirection.INFLOW,
          tx,
          { skipValidation: true },
        );
      });

      return this.findTransferEntry(ownerId, existing.transferGroupId);
    }

    if (existing.entryType === 'SPLIT') {
      if (dto.kind !== TransactionKind.EXPENSE) {
        throw new ConflictException(
          'Transaction kind cannot be changed. Delete and recreate the transaction.',
        );
      }

      if (dto.fundingLegs && dto.fundingLegs.length > 0) {
        const prepared = await this.prepareSplitExpenseTransaction(
          ownerId,
          dto,
          {
            fundingAccountIds: existing.rows.map((row) => row.accountId),
            categoryId: existing.rows[0]?.categoryId,
          },
        );

        await this.runSerializableTransaction(async (tx) => {
          for (const row of existing.rows) {
            await this.adjustAccountCashBalance(
              ownerId,
              row.accountId,
              row.amount,
              TransactionDirection.INFLOW,
              tx,
              { skipValidation: true },
            );
          }

          for (const leg of prepared.fundingLegs) {
            await this.validateAccountCashBalance(
              ownerId,
              leg.accountId,
              leg.amount,
              TransactionDirection.OUTFLOW,
              tx,
            );
          }

          await tx.transaction.deleteMany({
            where: {
              userId: ownerId,
              splitGroupId: existing.splitGroupId,
            },
          });

          for (const leg of prepared.fundingLegs) {
            await tx.transaction.create({
              data: {
                userId: ownerId,
                postedAt: prepared.postedAt,
                accountId: leg.accountId,
                categoryId: prepared.categoryId,
                amount: leg.amount,
                currency: prepared.currency,
                nativeAmount: null,
                nativeCurrency: null,
                fxRateUsed: null,
                fxRateSource: null,
                direction: TransactionDirection.OUTFLOW,
                kind: TransactionKind.EXPENSE,
                description: prepared.description,
                notes: prepared.notes,
                counterparty: prepared.counterparty,
                transferGroupId: null,
                splitGroupId: existing.splitGroupId,
              },
            });
          }

          for (const leg of prepared.fundingLegs) {
            await this.adjustAccountCashBalance(
              ownerId,
              leg.accountId,
              leg.amount,
              TransactionDirection.OUTFLOW,
              tx,
            );
          }
        });

        return this.findSplitEntry(ownerId, existing.splitGroupId);
      }

      const prepared = await this.prepareStandardTransaction(ownerId, dto, {
        categoryId: existing.rows[0]?.categoryId,
      });
      const isAdjustment = prepared.kind === TransactionKind.ADJUSTMENT;

      const row = await this.runSerializableTransaction(async (tx) => {
        for (const existingRow of existing.rows) {
          await this.adjustAccountCashBalance(
            ownerId,
            existingRow.accountId,
            existingRow.amount,
            TransactionDirection.INFLOW,
            tx,
            { skipValidation: true },
          );
        }

        if (!isAdjustment) {
          await this.validateAccountCashBalance(
            ownerId,
            prepared.accountId,
            prepared.amount,
            prepared.direction,
            tx,
          );
        }

        await tx.transaction.deleteMany({
          where: {
            userId: ownerId,
            splitGroupId: existing.splitGroupId,
          },
        });

        const createdRow = await tx.transaction.create({
          data: {
            userId: ownerId,
            postedAt: prepared.postedAt,
            accountId: prepared.accountId,
            categoryId: prepared.categoryId,
            amount: prepared.amount,
            currency: prepared.currency,
            nativeAmount: prepared.nativeAmount,
            nativeCurrency: prepared.nativeCurrency,
            fxRateUsed: prepared.fxRateUsed,
            fxRateSource: prepared.fxRateSource,
            direction: prepared.direction,
            kind: prepared.kind,
            description: prepared.description,
            notes: prepared.notes,
            counterparty: prepared.counterparty,
            transferGroupId: null,
            splitGroupId: null,
          },
          include: {
            account: true,
            category: {
              include: {
                parentCategory: true,
              },
            },
          },
        });

        if (!isAdjustment) {
          await this.adjustAccountCashBalance(
            ownerId,
            prepared.accountId,
            prepared.amount,
            prepared.direction,
            tx,
          );
        }

        return createdRow;
      });

      return {
        entryType: 'STANDARD',
        row,
      };
    }

    if (dto.kind === TransactionKind.TRANSFER) {
      throw new ConflictException(
        'Transaction kind cannot be changed. Delete and recreate the transaction.',
      );
    }

    if (dto.fundingLegs && dto.fundingLegs.length > 0) {
      if (existing.row.kind !== TransactionKind.EXPENSE) {
        throw new ConflictException(
          'Only expense transactions can be split across multiple accounts.',
        );
      }

      const prepared = await this.prepareSplitExpenseTransaction(ownerId, dto, {
        fundingAccountIds: [existing.row.accountId],
        categoryId: existing.row.categoryId,
      });
      const splitGroupId = `split_${randomUUID()}`;

      await this.runSerializableTransaction(async (tx) => {
        await this.adjustAccountCashBalance(
          ownerId,
          existing.row.accountId,
          existing.row.amount,
          TransactionDirection.INFLOW,
          tx,
          { skipValidation: true },
        );

        for (const leg of prepared.fundingLegs) {
          await this.validateAccountCashBalance(
            ownerId,
            leg.accountId,
            leg.amount,
            TransactionDirection.OUTFLOW,
            tx,
          );
        }

        await tx.transaction.delete({
          where: { id: existing.row.id },
        });

        for (const leg of prepared.fundingLegs) {
          await tx.transaction.create({
            data: {
              userId: ownerId,
              postedAt: prepared.postedAt,
              accountId: leg.accountId,
              categoryId: prepared.categoryId,
              amount: leg.amount,
              currency: prepared.currency,
              nativeAmount: null,
              nativeCurrency: null,
              fxRateUsed: null,
              fxRateSource: null,
              direction: TransactionDirection.OUTFLOW,
              kind: TransactionKind.EXPENSE,
              description: prepared.description,
              notes: prepared.notes,
              counterparty: prepared.counterparty,
              transferGroupId: null,
              splitGroupId,
            },
          });
        }

        for (const leg of prepared.fundingLegs) {
          await this.adjustAccountCashBalance(
            ownerId,
            leg.accountId,
            leg.amount,
            TransactionDirection.OUTFLOW,
            tx,
          );
        }
      });

      return this.findSplitEntry(ownerId, splitGroupId);
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

    if (
      mirroredBrokerageOperation &&
      (prepared.accountId !== existing.row.accountId ||
        prepared.direction !== existing.row.direction)
    ) {
      throw new ConflictException(
        'A brokerage dividend or fee must remain in its original account and keep its cash direction.',
      );
    }

    const isAdjustment = prepared.kind === TransactionKind.ADJUSTMENT;

    const row = await this.runSerializableTransaction(async (tx) => {
      if (!isAdjustment) {
        // Reverse the old transaction's cash effect before validating the
        // replacement against the same atomic balance state.
        const reverseDirection =
          existing.row.direction === TransactionDirection.INFLOW
            ? TransactionDirection.OUTFLOW
            : TransactionDirection.INFLOW;
        await this.adjustAccountCashBalance(
          ownerId,
          existing.row.accountId,
          existing.row.amount,
          reverseDirection,
          tx,
          { skipValidation: true },
        );

        await this.validateAccountCashBalance(
          ownerId,
          prepared.accountId,
          prepared.amount,
          prepared.direction,
          tx,
        );
      }

      const updatedRow = await tx.transaction.update({
        where: { id: existing.row.id },
        data: {
          postedAt: prepared.postedAt,
          accountId: prepared.accountId,
          categoryId: prepared.categoryId,
          amount: prepared.amount,
          currency: prepared.currency,
          nativeAmount: prepared.nativeAmount,
          nativeCurrency: prepared.nativeCurrency,
          fxRateUsed: prepared.fxRateUsed,
          fxRateSource: prepared.fxRateSource,
          direction: prepared.direction,
          description: prepared.description,
          notes: prepared.notes,
          counterparty: prepared.counterparty,
        },
        include: {
          account: true,
          category: {
            include: {
              parentCategory: true,
            },
          },
        },
      });

      if (mirroredBrokerageOperation) {
        await tx.brokerageOperation.update({
          where: { id: mirroredBrokerageOperation.id },
          data: {
            postedAt: prepared.postedAt,
            currency: prepared.currency,
            grossAmount: prepared.amount,
            cashAmount:
              prepared.direction === TransactionDirection.INFLOW
                ? prepared.amount
                : prepared.amount.neg(),
            notes: prepared.notes,
          },
        });
      }

      if (!isAdjustment) {
        await this.adjustAccountCashBalance(
          ownerId,
          prepared.accountId,
          prepared.amount,
          prepared.direction,
          tx,
        );
      }

      return updatedRow;
    });

    return {
      entryType: 'STANDARD',
      row,
    };
  }

  async remove(ownerId: string, id: string): Promise<void> {
    const existing = await this.findOne(ownerId, id);
    this.assertEntryIsMutable(existing);
    const mirroredBrokerageOperation =
      existing.entryType === 'STANDARD'
        ? await this.prisma.brokerageOperation.findFirst({
            where: {
              userId: ownerId,
              mirroredTransactionId: existing.row.id,
            },
            select: { id: true },
          })
        : null;

    if (existing.entryType === 'TRANSFER') {
      await this.runSerializableTransaction(async (tx) => {
        // Reverse cash effects for both legs of the transfer (skip validation)
        await this.adjustAccountCashBalance(
          ownerId,
          existing.outflow.accountId,
          existing.outflow.amount,
          TransactionDirection.INFLOW,
          tx,
          { skipValidation: true },
        );
        await this.adjustAccountCashBalance(
          ownerId,
          existing.inflow.accountId,
          existing.inflow.amount,
          TransactionDirection.OUTFLOW,
          tx,
          { skipValidation: true },
        );
        await tx.transaction.deleteMany({
          where: {
            userId: ownerId,
            transferGroupId: existing.transferGroupId,
          },
        });
      });
      return;
    }

    if (existing.entryType === 'SPLIT') {
      await this.runSerializableTransaction(async (tx) => {
        for (const row of existing.rows) {
          await this.adjustAccountCashBalance(
            ownerId,
            row.accountId,
            row.amount,
            TransactionDirection.INFLOW,
            tx,
            { skipValidation: true },
          );
        }

        await tx.transaction.deleteMany({
          where: {
            userId: ownerId,
            splitGroupId: existing.splitGroupId,
          },
        });
      });
      return;
    }

    const isAdjustment = existing.row.kind === TransactionKind.ADJUSTMENT;

    await this.runSerializableTransaction(async (tx) => {
      if (!isAdjustment) {
        // Reverse the deleted transaction's cash effect (skip validation)
        const reverseDirection =
          existing.row.direction === TransactionDirection.INFLOW
            ? TransactionDirection.OUTFLOW
            : TransactionDirection.INFLOW;
        await this.adjustAccountCashBalance(
          ownerId,
          existing.row.accountId,
          existing.row.amount,
          reverseDirection,
          tx,
          { skipValidation: true },
        );
      }

      if (mirroredBrokerageOperation) {
        await tx.brokerageOperation.delete({
          where: { id: mirroredBrokerageOperation.id },
        });
      }

      await tx.transaction.delete({
        where: { id: existing.row.id },
      });
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
        ...this.toCategoryWhere(filters),
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
        category: {
          include: {
            parentCategory: true,
          },
        },
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
          ...this.toCategoryWhere(filters),
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
          category: {
            include: {
              parentCategory: true,
            },
          },
        },
      }),
      filters.categoryId ||
      filters.primaryCategoryId ||
      filters.secondaryCategoryId
        ? Promise.resolve([])
        : this.prisma.transaction.findMany({
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
              category: {
                include: {
                  parentCategory: true,
                },
              },
            },
          }),
    ]);

    return this.buildMonthlyCashflow(monthKeys, standardRows, transferRows);
  }

  async getCashflowAnalytics(
    ownerId: string,
    filters: CashflowAnalyticsFilters,
  ): Promise<CashflowAnalyticsResponse> {
    const range = this.resolveRequiredMonthlyRange(filters.from, filters.to);
    const monthlyCashflow = await this.getMonthlyCashflow(ownerId, {
      from: range.from,
      to: range.to,
      accountIds: filters.accountId ? [filters.accountId] : undefined,
      categoryId: filters.categoryId,
      includeArchivedAccounts: filters.includeArchivedAccounts,
    });

    return {
      from: range.from,
      to: range.to,
      focusMonth: range.to,
      reportingOverview: null,
      currencies: monthlyCashflow.map((bucket) =>
        this.toCashflowAnalyticsCurrency(bucket, range.to),
      ),
    };
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
      await this.validateAccountCashBalance(
        ownerId,
        prepared.sourceAccountId,
        prepared.sourceAmount,
        TransactionDirection.OUTFLOW,
        tx,
      );

      await tx.transaction.create({
        data: {
          userId: ownerId,
          postedAt: prepared.postedAt,
          accountId: prepared.sourceAccountId,
          categoryId: null,
          amount: prepared.sourceAmount,
          currency: prepared.sourceCurrency,
          nativeAmount: null,
          nativeCurrency: null,
          fxRateUsed: prepared.fxRateUsed,
          fxRateSource: prepared.fxRateSource,
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
          amount: prepared.destinationAmount,
          currency: prepared.destinationCurrency,
          nativeAmount: null,
          nativeCurrency: null,
          fxRateUsed: prepared.fxRateUsed,
          fxRateSource: prepared.fxRateSource,
          direction: TransactionDirection.INFLOW,
          kind: TransactionKind.TRANSFER,
          description: prepared.description,
          notes: prepared.notes,
          counterparty: null,
          transferGroupId,
        },
      });

      await this.adjustAccountCashBalance(
        ownerId,
        prepared.sourceAccountId,
        prepared.sourceAmount,
        TransactionDirection.OUTFLOW,
        tx,
      );
      await this.adjustAccountCashBalance(
        ownerId,
        prepared.destinationAccountId,
        prepared.destinationAmount,
        TransactionDirection.INFLOW,
        tx,
      );
    };

    if (client === this.prisma) {
      await this.runSerializableTransaction(persistTransfer);
    } else {
      await persistTransfer(client);
    }

    return this.findTransferEntry(ownerId, transferGroupId, client);
  }

  private async createSplitExpense(
    ownerId: string,
    dto: CreateTransactionDto,
    client: TransactionWriteClient = this.prisma,
  ): Promise<LogicalTransactionEntry> {
    const prepared = await this.prepareSplitExpenseTransaction(ownerId, dto);
    const splitGroupId = `split_${randomUUID()}`;

    const persistSplitExpense = async (
      tx: Prisma.TransactionClient,
    ): Promise<void> => {
      for (const leg of prepared.fundingLegs) {
        await this.validateAccountCashBalance(
          ownerId,
          leg.accountId,
          leg.amount,
          TransactionDirection.OUTFLOW,
          tx,
        );
      }

      for (const leg of prepared.fundingLegs) {
        await tx.transaction.create({
          data: {
            userId: ownerId,
            postedAt: prepared.postedAt,
            accountId: leg.accountId,
            categoryId: prepared.categoryId,
            amount: leg.amount,
            currency: prepared.currency,
            nativeAmount: null,
            nativeCurrency: null,
            fxRateUsed: null,
            fxRateSource: null,
            direction: TransactionDirection.OUTFLOW,
            kind: TransactionKind.EXPENSE,
            description: prepared.description,
            notes: prepared.notes,
            counterparty: prepared.counterparty,
            transferGroupId: null,
            splitGroupId,
          },
        });
      }

      for (const leg of prepared.fundingLegs) {
        await this.adjustAccountCashBalance(
          ownerId,
          leg.accountId,
          leg.amount,
          TransactionDirection.OUTFLOW,
          tx,
        );
      }
    };

    if (client === this.prisma) {
      await this.runSerializableTransaction(persistSplitExpense);
    } else {
      await persistSplitExpense(client);
    }

    return this.findSplitEntry(ownerId, splitGroupId, client);
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

    if (dto.fundingLegs && dto.fundingLegs.length > 0) {
      throw new BadRequestException(
        'Split funding is only valid for split expense transactions.',
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
    } else if (dto.kind === TransactionKind.EXPENSE) {
      const matchedCategory =
        await this.categoriesService.findMatchingExpenseSecondaryCategory(
          ownerId,
          dto.description
            ? normalizeExpenseValidationEntry(dto.description)
            : '',
        );
      categoryId = matchedCategory?.id ?? null;
    }

    if (
      (dto.kind === TransactionKind.EXPENSE ||
        dto.kind === TransactionKind.INCOME) &&
      !categoryId
    ) {
      throw new BadRequestException(
        'Expense and income transactions require a category.',
      );
    }

    const postedAt = this.parsePostedAt(dto.postedAt);
    this.assertPostedAtAllowedForAccount(account, postedAt);

    const normalizedNativeCurrency = dto.nativeCurrency
      ? dto.nativeCurrency.trim().toUpperCase()
      : null;
    let nativeAmount: Prisma.Decimal | null = null;
    let nativeCurrency: string | null = null;
    let fxRateUsed: Prisma.Decimal | null = null;
    let fxRateSource: FxRateSource | null = null;

    if (
      normalizedNativeCurrency &&
      normalizedNativeCurrency !== account.currency
    ) {
      nativeCurrency = normalizedNativeCurrency;
      nativeAmount =
        dto.nativeAmount !== undefined && dto.nativeAmount !== null
          ? this.toDecimal(dto.nativeAmount)
          : null;

      if (!nativeAmount) {
        throw new BadRequestException(
          'nativeAmount is required when nativeCurrency differs from the account currency.',
        );
      }

      if (dto.fxRateUsed !== undefined && dto.fxRateUsed !== null) {
        fxRateUsed = this.toDecimal(dto.fxRateUsed);
        fxRateSource = dto.fxRateSource ?? FxRateSource.MANUAL;
        await this.pricesService.saveManualFxRate(
          ownerId,
          postedAt,
          nativeCurrency,
          account.currency,
          fxRateUsed,
        );
      } else {
        const storedRate = await this.pricesService.getStoredFxRateSnapshot(
          ownerId,
          postedAt,
          nativeCurrency,
          account.currency,
        );
        fxRateUsed = storedRate.rate;
        fxRateSource = storedRate.source;
      }

      if (!fxRateUsed) {
        throw new BadRequestException(
          `No FX rate is available for ${nativeCurrency} to ${account.currency}.`,
        );
      }

      const expectedSettledAmount = nativeAmount.mul(fxRateUsed);
      if (
        !this.decimalsClose(expectedSettledAmount, this.toDecimal(dto.amount))
      ) {
        throw new BadRequestException(
          'The settled amount must match the native amount multiplied by the FX rate.',
        );
      }
    }

    return {
      postedAt,
      amount: this.toDecimal(dto.amount),
      currency: account.currency,
      nativeAmount,
      nativeCurrency,
      fxRateUsed,
      fxRateSource,
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

  private async prepareSplitExpenseTransaction(
    ownerId: string,
    dto: CreateTransactionDto | UpdateTransactionDto,
    current?: {
      fundingAccountIds?: string[];
      categoryId?: string | null;
    },
  ): Promise<PreparedSplitTransactionInput> {
    if (dto.kind !== TransactionKind.EXPENSE) {
      throw new BadRequestException(
        'Split funding is only supported for expense transactions.',
      );
    }

    if (dto.accountId || dto.sourceAccountId || dto.destinationAccountId) {
      throw new BadRequestException(
        'Split-funded expenses must omit accountId, sourceAccountId, and destinationAccountId.',
      );
    }

    if (dto.direction && dto.direction !== TransactionDirection.OUTFLOW) {
      throw new BadRequestException(
        'Split-funded expenses must use the OUTFLOW direction.',
      );
    }

    const fundingLegs = dto.fundingLegs ?? [];
    if (fundingLegs.length < 2) {
      throw new BadRequestException(
        'Split-funded expenses require at least two funding legs.',
      );
    }

    const normalizedLegs = fundingLegs.map((leg) => ({
      accountId: leg.accountId.trim(),
      amount: this.toDecimal(leg.amount),
    }));

    if (normalizedLegs.some((leg) => !leg.accountId)) {
      throw new BadRequestException('Each funding leg requires an accountId.');
    }

    if (
      new Set(normalizedLegs.map((leg) => leg.accountId)).size !==
      normalizedLegs.length
    ) {
      throw new BadRequestException(
        'Split-funded expenses cannot repeat the same account.',
      );
    }

    const categoryId = dto.categoryId
      ? (
          await this.categoriesService.getAssignableCategory(
            ownerId,
            dto.categoryId,
            dto.kind,
            current?.categoryId,
          )
        ).id
      : ((
          await this.categoriesService.findMatchingExpenseSecondaryCategory(
            ownerId,
            dto.description
              ? normalizeExpenseValidationEntry(dto.description)
              : '',
          )
        )?.id ?? null);

    if (!categoryId) {
      throw new BadRequestException('Expense transactions require a category.');
    }

    const totalAmount = this.toDecimal(dto.amount);
    const sumOfLegAmounts = normalizedLegs.reduce(
      (sum, leg) => sum.add(leg.amount),
      new Prisma.Decimal('0'),
    );

    if (!sumOfLegAmounts.eq(totalAmount)) {
      throw new BadRequestException(
        'The total amount must equal the sum of all funding legs.',
      );
    }

    const accounts = await Promise.all(
      normalizedLegs.map((leg) =>
        this.accountsService.getAssignableAccount(
          ownerId,
          leg.accountId,
          current?.fundingAccountIds?.includes(leg.accountId)
            ? leg.accountId
            : undefined,
        ),
      ),
    );

    const currency = accounts[0]?.currency;
    if (!currency) {
      throw new BadRequestException('Split funding requires valid accounts.');
    }

    if (accounts.some((account) => account.currency !== currency)) {
      throw new BadRequestException(
        'Split-funded expenses require accounts with the same currency.',
      );
    }

    const postedAt = this.parsePostedAt(dto.postedAt);
    for (const account of accounts) {
      this.assertPostedAtAllowedForAccount(account, postedAt);
    }

    return {
      postedAt,
      amount: totalAmount,
      currency,
      categoryId,
      description: this.requireText(
        dto.description,
        'Description is required.',
      ),
      notes: this.optionalText(dto.notes),
      counterparty: this.optionalText(dto.counterparty),
      fundingLegs: normalizedLegs,
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

    if (dto.fundingLegs && dto.fundingLegs.length > 0) {
      throw new BadRequestException(
        'Transfers cannot be split across multiple accounts.',
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

    const postedAt = this.parsePostedAt(dto.postedAt);
    this.assertPostedAtAllowedForAccount(sourceAccount, postedAt);
    this.assertPostedAtAllowedForAccount(destinationAccount, postedAt);

    const sourceAmount = this.toDecimal(dto.sourceAmount ?? dto.amount);
    let destinationAmount = this.toDecimal(dto.destinationAmount ?? dto.amount);
    const sourceCurrency = sourceAccount.currency;
    const destinationCurrency = destinationAccount.currency;
    let fxRateUsed: Prisma.Decimal;
    let fxRateSource: FxRateSource | null;

    if (sourceCurrency !== destinationCurrency) {
      if (dto.fxRateUsed !== undefined && dto.fxRateUsed !== null) {
        fxRateUsed = this.toDecimal(dto.fxRateUsed);
        fxRateSource = dto.fxRateSource ?? FxRateSource.MANUAL;
        await this.pricesService.saveManualFxRate(
          ownerId,
          postedAt,
          sourceCurrency,
          destinationCurrency,
          fxRateUsed,
        );
      } else {
        const storedRate = await this.pricesService.getStoredFxRateSnapshot(
          ownerId,
          postedAt,
          sourceCurrency,
          destinationCurrency,
        );
        fxRateUsed = storedRate.rate;
        fxRateSource = storedRate.source;
      }

      if (!fxRateUsed) {
        throw new BadRequestException(
          `No FX rate is available for ${sourceCurrency} to ${destinationCurrency}.`,
        );
      }

      const computedDestinationAmount = sourceAmount.mul(fxRateUsed);
      if (
        dto.destinationAmount !== undefined &&
        dto.destinationAmount !== null
      ) {
        if (!this.decimalsClose(computedDestinationAmount, destinationAmount)) {
          throw new BadRequestException(
            'The destination amount must match the source amount multiplied by the FX rate.',
          );
        }
      } else {
        destinationAmount = computedDestinationAmount;
      }
    } else {
      fxRateUsed = new Prisma.Decimal(1);
      fxRateSource = dto.fxRateSource ?? null;
      destinationAmount = sourceAmount;
    }

    return {
      postedAt,
      sourceAmount,
      destinationAmount,
      sourceCurrency,
      destinationCurrency,
      fxRateUsed,
      fxRateSource,
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
    pagination: { skip: number; take: number },
  ): Promise<TransactionRecord[]> {
    return this.prisma.transaction.findMany({
      where: {
        userId: ownerId,
        ...(filters.accountId ? { accountId: filters.accountId } : {}),
        ...(filters.kind ? { kind: filters.kind } : {}),
        ...this.toCategoryWhere(filters),
        ...this.toPostedAtWhere(filters.from, filters.to),
      },
      include: {
        account: true,
        category: {
          include: {
            parentCategory: true,
          },
        },
      },
      orderBy: [{ postedAt: 'desc' }, { updatedAt: 'desc' }, { id: 'desc' }],
      ...pagination,
    });
  }

  private async hydrateLogicalEntryRows(
    ownerId: string,
    rows: TransactionRecord[],
  ): Promise<TransactionRecord[]> {
    const transferGroupIds = [
      ...new Set(
        rows
          .filter(
            (row) =>
              row.kind === TransactionKind.TRANSFER &&
              row.transferGroupId !== null,
          )
          .map((row) => row.transferGroupId as string),
      ),
    ];
    const splitGroupIds = [
      ...new Set(
        rows
          .filter((row) => row.splitGroupId !== null)
          .map((row) => row.splitGroupId as string),
      ),
    ];

    if (transferGroupIds.length === 0 && splitGroupIds.length === 0) {
      return rows;
    }

    const relatedRows = await this.prisma.transaction.findMany({
      where: {
        userId: ownerId,
        OR: [
          ...(transferGroupIds.length > 0
            ? [{ transferGroupId: { in: transferGroupIds } }]
            : []),
          ...(splitGroupIds.length > 0
            ? [{ splitGroupId: { in: splitGroupIds } }]
            : []),
        ],
      },
      include: {
        account: true,
        category: {
          include: {
            parentCategory: true,
          },
        },
      },
    });

    return [
      ...new Map(
        [...rows, ...relatedRows].map((row) => [row.id, row]),
      ).values(),
    ];
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
        category: {
          include: {
            parentCategory: true,
          },
        },
      },
    });

    if (rows.length === 0) {
      throw new NotFoundException(
        `Transaction ${transferGroupId} was not found.`,
      );
    }

    return this.toTransferEntry(transferGroupId, rows);
  }

  private async findSplitEntry(
    ownerId: string,
    splitGroupId: string,
    client: TransactionWriteClient = this.prisma,
  ): Promise<LogicalTransactionEntry> {
    const rows = await client.transaction.findMany({
      where: {
        userId: ownerId,
        splitGroupId,
      },
      include: {
        account: true,
        category: {
          include: {
            parentCategory: true,
          },
        },
      },
    });

    if (rows.length === 0) {
      throw new NotFoundException(`Transaction ${splitGroupId} was not found.`);
    }

    return this.toSplitEntry(splitGroupId, rows);
  }

  private assertEntryIsMutable(entry: LogicalTransactionEntry): void {
    if (entry.entryType === 'STANDARD') {
      if (entry.row.recurringRuleId) {
        throw new ConflictException(
          'Generated recurring transactions cannot be edited or deleted. Update the recurring rule instead.',
        );
      }

      return;
    }

    if (entry.entryType === 'SPLIT') {
      if (entry.rows.some((row) => row.recurringRuleId)) {
        throw new ConflictException(
          'Generated recurring transactions cannot be edited or deleted. Update the recurring rule instead.',
        );
      }

      return;
    }

    if (entry.outflow.recurringRuleId || entry.inflow.recurringRuleId) {
      throw new ConflictException(
        'Generated recurring transactions cannot be edited or deleted. Update the recurring rule instead.',
      );
    }
  }

  private toLogicalEntries(
    rows: TransactionRecord[],
  ): LogicalTransactionEntry[] {
    const entries: LogicalTransactionEntry[] = [];
    const transferGroups = new Map<string, TransactionRecord[]>();
    const splitGroups = new Map<string, TransactionRecord[]>();

    for (const row of rows) {
      if (row.kind === TransactionKind.TRANSFER && row.transferGroupId) {
        const group = transferGroups.get(row.transferGroupId) ?? [];
        group.push(row);
        transferGroups.set(row.transferGroupId, group);
        continue;
      }

      if (row.splitGroupId) {
        const group = splitGroups.get(row.splitGroupId) ?? [];
        group.push(row);
        splitGroups.set(row.splitGroupId, group);
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

    for (const [splitGroupId, groupRows] of splitGroups.entries()) {
      entries.push(this.toSplitEntry(splitGroupId, groupRows));
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

  private toSplitEntry(
    splitGroupId: string,
    rows: TransactionRecord[],
  ): LogicalTransactionEntry {
    if (rows.length < 2) {
      throw new ConflictException(
        `Split expense ${splitGroupId} is incomplete and cannot be represented.`,
      );
    }

    const [firstRow] = rows;
    const firstOccurrenceMonthTime =
      firstRow.recurringOccurrenceMonth?.getTime() ?? null;
    const isConsistent = rows.every(
      (row) =>
        row.kind === TransactionKind.EXPENSE &&
        row.direction === TransactionDirection.OUTFLOW &&
        row.currency === firstRow.currency &&
        row.categoryId === firstRow.categoryId &&
        row.postedAt.getTime() === firstRow.postedAt.getTime() &&
        row.description === firstRow.description &&
        row.notes === firstRow.notes &&
        row.counterparty === firstRow.counterparty &&
        row.recurringRuleId === firstRow.recurringRuleId &&
        (row.recurringOccurrenceMonth?.getTime() ?? null) ===
          firstOccurrenceMonthTime,
    );

    if (!isConsistent) {
      throw new ConflictException(
        `Split expense ${splitGroupId} is inconsistent and cannot be represented.`,
      );
    }

    return {
      entryType: 'SPLIT',
      splitGroupId,
      rows: rows
        .slice()
        .sort(
          (left, right) =>
            left.createdAt.getTime() - right.createdAt.getTime() ||
            left.id.localeCompare(right.id),
        ),
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
        entry.entryType !== 'TRANSFER' &&
        this.getEntryCategoryId(entry) === filters.categoryId
      );
    }

    if (
      filters.secondaryCategoryId &&
      (entry.entryType === 'TRANSFER' ||
        this.getEntryCategoryId(entry) !== filters.secondaryCategoryId)
    ) {
      return false;
    }

    if (filters.primaryCategoryId) {
      if (entry.entryType === 'TRANSFER') {
        return false;
      }

      const categoryHierarchy = getCategoryHierarchyMetadata(
        this.getEntryCategory(entry),
      );
      return categoryHierarchy.primaryCategoryId === filters.primaryCategoryId;
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
      limit: this.normalizeLimit(filters.limit),
      offset: paginationRequested
        ? this.normalizeOffset(filters.offset)
        : DEFAULT_TRANSACTION_OFFSET,
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

  private toCategoryWhere(filters: {
    categoryId?: string;
    primaryCategoryId?: string;
    secondaryCategoryId?: string;
  }): Prisma.TransactionWhereInput {
    if (filters.categoryId) {
      return { categoryId: filters.categoryId };
    }

    if (filters.secondaryCategoryId) {
      return { categoryId: filters.secondaryCategoryId };
    }

    if (filters.primaryCategoryId) {
      return {
        category: {
          parentCategoryId: filters.primaryCategoryId,
        },
      };
    }

    return {};
  }

  private getTodayRomeDateString(): string {
    const parts = ROME_DATE_FORMATTER.formatToParts(new Date());
    const year = parts.find((part) => part.type === 'year')?.value;
    const month = parts.find((part) => part.type === 'month')?.value;
    const day = parts.find((part) => part.type === 'day')?.value;

    if (!year || !month || !day) {
      throw new InternalServerErrorException(
        'Unable to resolve the current Europe/Rome date.',
      );
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

    if (entry.entryType === 'SPLIT') {
      return entry.rows.some((row) => row.account.archivedAt !== null);
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

    if (entry.entryType === 'SPLIT') {
      return entry.rows.some((row) => row.accountId === accountId);
    }

    return (
      entry.outflow.accountId === accountId ||
      entry.inflow.accountId === accountId
    );
  }

  private getEntryKind(entry: LogicalTransactionEntry): TransactionKind {
    if (entry.entryType === 'STANDARD') {
      return entry.row.kind;
    }

    if (entry.entryType === 'SPLIT') {
      return entry.rows[0].kind;
    }

    return TransactionKind.TRANSFER;
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
    if (entry.entryType === 'STANDARD') {
      return entry.row.postedAt;
    }

    if (entry.entryType === 'SPLIT') {
      return entry.rows[0].postedAt;
    }

    return entry.outflow.postedAt;
  }

  private getEntryUpdatedAt(entry: LogicalTransactionEntry): Date {
    if (entry.entryType === 'STANDARD') {
      return entry.row.updatedAt;
    }

    if (entry.entryType === 'SPLIT') {
      return entry.rows.reduce(
        (latest, row) =>
          row.updatedAt.getTime() > latest.getTime() ? row.updatedAt : latest,
        entry.rows[0].updatedAt,
      );
    }

    return entry.outflow.updatedAt.getTime() >= entry.inflow.updatedAt.getTime()
      ? entry.outflow.updatedAt
      : entry.inflow.updatedAt;
  }

  private getEntryId(entry: LogicalTransactionEntry): string {
    if (entry.entryType === 'STANDARD') {
      return entry.row.id;
    }

    if (entry.entryType === 'SPLIT') {
      return entry.splitGroupId;
    }

    return entry.transferGroupId;
  }

  private getEntryCategoryId(entry: LogicalTransactionEntry): string | null {
    if (entry.entryType === 'STANDARD') {
      return entry.row.categoryId;
    }

    if (entry.entryType === 'SPLIT') {
      return entry.rows[0].categoryId;
    }

    return null;
  }

  private getEntryCategory(entry: LogicalTransactionEntry) {
    if (entry.entryType === 'STANDARD') {
      return entry.row.category;
    }

    if (entry.entryType === 'SPLIT') {
      return entry.rows[0].category;
    }

    return null;
  }

  private buildMonthlyCashflow(
    monthKeys: string[],
    standardRows: TransactionRecord[],
    transferRows: TransactionRecord[],
  ): MonthlyCashflowResponse {
    type CategoryAccumulator = {
      categoryId: string | null;
      name: string;
      primaryCategoryId: string | null;
      primaryCategoryName: string | null;
      secondaryCategoryId: string | null;
      secondaryCategoryName: string | null;
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
          getCategoryHierarchyMetadata(row.category),
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
          getCategoryHierarchyMetadata(row.category),
          row.amount,
        );
        this.addMonthlyCategoryTotal(
          currency.rangeExpenseCategories,
          row.categoryId,
          row.category?.name ?? 'Uncategorized',
          getCategoryHierarchyMetadata(row.category),
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

  private toCashflowAnalyticsCurrency(
    bucket: MonthlyCashflowCurrencyResponse,
    focusMonth: string,
  ): CashflowAnalyticsCurrencyResponse {
    const previousMonth = this.findPreviousMonth(bucket.months, focusMonth);

    return {
      currency: bucket.currency,
      averageMonthlyExpense: bucket.averageMonthlyExpense,
      averageMonthlyIncome: this.averageMonthlyIncome(bucket.months),
      monthlySeries: bucket.months.map((month) =>
        this.toCashflowAnalyticsMonthPoint(month),
      ),
      focusMonthExpenseBreakdown: this.toAnalyticsBreakdown(
        this.findMonthOrThrow(bucket.months, focusMonth).expenseCategories,
      ),
      focusMonthIncomeBreakdown: this.toAnalyticsBreakdown(
        this.findMonthOrThrow(bucket.months, focusMonth).incomeCategories,
      ),
      expenseCategoryTrends: this.buildCategoryTrends(
        bucket.months,
        'expenseCategories',
      ),
      incomeCategoryTrends: this.buildCategoryTrends(
        bucket.months,
        'incomeCategories',
      ),
      expenseMonthOverMonthChanges: previousMonth
        ? this.buildMonthOverMonthChanges(
            previousMonth.expenseCategories,
            this.findMonthOrThrow(bucket.months, focusMonth).expenseCategories,
          )
        : [],
      incomeMonthOverMonthChanges: previousMonth
        ? this.buildMonthOverMonthChanges(
            previousMonth.incomeCategories,
            this.findMonthOrThrow(bucket.months, focusMonth).incomeCategories,
          )
        : [],
    };
  }

  private toCashflowAnalyticsMonthPoint(
    month: MonthlyCashflowMonthResponse,
  ): CashflowAnalyticsMonthPointResponse {
    return {
      month: month.month,
      incomeTotal: month.incomeTotal,
      expenseTotal: month.expenseTotal,
      netCashflow: month.netCashflow,
      adjustmentInTotal: month.adjustmentInTotal,
      adjustmentOutTotal: month.adjustmentOutTotal,
      uncategorizedExpenseTotal: month.uncategorizedExpenseTotal,
      uncategorizedIncomeTotal: month.uncategorizedIncomeTotal,
    };
  }

  private averageMonthlyIncome(months: MonthlyCashflowMonthResponse[]): number {
    if (months.length === 0) {
      return 0;
    }

    return (
      months.reduce((sum, month) => sum + month.incomeTotal, 0) / months.length
    );
  }

  private findMonthOrThrow(
    months: MonthlyCashflowMonthResponse[],
    monthKey: string,
  ): MonthlyCashflowMonthResponse {
    const match = months.find((month) => month.month === monthKey);

    if (!match) {
      throw new InternalServerErrorException(
        `Month ${monthKey} is missing from monthly cashflow.`,
      );
    }

    return match;
  }

  private findPreviousMonth(
    months: MonthlyCashflowMonthResponse[],
    monthKey: string,
  ): MonthlyCashflowMonthResponse | null {
    const index = months.findIndex((month) => month.month === monthKey);

    if (index <= 0) {
      return null;
    }

    return months[index - 1] ?? null;
  }

  private toAnalyticsBreakdown(
    items: MonthlyCashflowCategoryTotalResponse[],
  ): CashflowAnalyticsBreakdownItemResponse[] {
    return items.slice(0, ANALYTICS_BREAKDOWN_LIMIT).map((item) => ({
      categoryId: item.categoryId,
      name: item.name,
      primaryCategoryId: item.primaryCategoryId,
      primaryCategoryName: item.primaryCategoryName,
      secondaryCategoryId: item.secondaryCategoryId,
      secondaryCategoryName: item.secondaryCategoryName,
      total: item.total,
    }));
  }

  private buildCategoryTrends(
    months: MonthlyCashflowMonthResponse[],
    field: 'expenseCategories' | 'incomeCategories',
  ): CashflowAnalyticsCategoryTrendResponse[] {
    const totalsByCategory = new Map<
      string,
      {
        categoryId: string | null;
        name: string;
        primaryCategoryId: string | null;
        primaryCategoryName: string | null;
        secondaryCategoryId: string | null;
        secondaryCategoryName: string | null;
        total: number;
        series: Map<string, number>;
      }
    >();

    for (const month of months) {
      for (const item of month[field]) {
        const key = item.categoryId ?? 'uncategorized';
        const existing = totalsByCategory.get(key) ?? {
          categoryId: item.categoryId,
          name: item.name,
          primaryCategoryId: item.primaryCategoryId,
          primaryCategoryName: item.primaryCategoryName,
          secondaryCategoryId: item.secondaryCategoryId,
          secondaryCategoryName: item.secondaryCategoryName,
          total: 0,
          series: new Map<string, number>(),
        };
        existing.total += item.total;
        existing.series.set(month.month, item.total);
        totalsByCategory.set(key, existing);
      }
    }

    return [...totalsByCategory.values()]
      .sort((left, right) => {
        if (right.total !== left.total) {
          return right.total - left.total;
        }

        return left.name.localeCompare(right.name);
      })
      .slice(0, ANALYTICS_TREND_LIMIT)
      .map((item) => ({
        categoryId: item.categoryId,
        name: item.name,
        primaryCategoryId: item.primaryCategoryId,
        primaryCategoryName: item.primaryCategoryName,
        secondaryCategoryId: item.secondaryCategoryId,
        secondaryCategoryName: item.secondaryCategoryName,
        total: item.total,
        series: months.map((month) => ({
          month: month.month,
          total: item.series.get(month.month) ?? 0,
        })),
      }));
  }

  private buildMonthOverMonthChanges(
    previous: MonthlyCashflowCategoryTotalResponse[],
    current: MonthlyCashflowCategoryTotalResponse[],
  ): CashflowAnalyticsMonthOverMonthChangeResponse[] {
    const previousByCategory = new Map(
      previous.map((item) => [item.categoryId ?? 'uncategorized', item]),
    );
    const currentByCategory = new Map(
      current.map((item) => [item.categoryId ?? 'uncategorized', item]),
    );
    const keys = new Set([
      ...previousByCategory.keys(),
      ...currentByCategory.keys(),
    ]);

    return [...keys]
      .map((key) => {
        const previousItem = previousByCategory.get(key) ?? null;
        const currentItem = currentByCategory.get(key) ?? null;

        return {
          categoryId:
            currentItem?.categoryId ?? previousItem?.categoryId ?? null,
          name: currentItem?.name ?? previousItem?.name ?? 'Uncategorized',
          primaryCategoryId:
            currentItem?.primaryCategoryId ??
            previousItem?.primaryCategoryId ??
            null,
          primaryCategoryName:
            currentItem?.primaryCategoryName ??
            previousItem?.primaryCategoryName ??
            null,
          secondaryCategoryId:
            currentItem?.secondaryCategoryId ??
            previousItem?.secondaryCategoryId ??
            null,
          secondaryCategoryName:
            currentItem?.secondaryCategoryName ??
            previousItem?.secondaryCategoryName ??
            null,
          previousTotal: previousItem?.total ?? 0,
          currentTotal: currentItem?.total ?? 0,
          delta: (currentItem?.total ?? 0) - (previousItem?.total ?? 0),
        };
      })
      .sort((left, right) => {
        const deltaDifference = Math.abs(right.delta) - Math.abs(left.delta);
        if (deltaDifference !== 0) {
          return deltaDifference;
        }

        return left.name.localeCompare(right.name);
      })
      .slice(0, ANALYTICS_DELTA_LIMIT);
  }

  private buildCashflowSummary(
    rows: TransactionRecord[],
  ): CashflowSummaryResponse {
    type CategoryCashflowTotal = {
      categoryId: string | null;
      name: string;
      type: CategoryType;
      primaryCategoryId: string | null;
      primaryCategoryName: string | null;
      secondaryCategoryId: string | null;
      secondaryCategoryName: string | null;
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
          ...getCategoryHierarchyMetadata(row.category),
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
            primaryCategoryId: categoryTotal.primaryCategoryId,
            primaryCategoryName: categoryTotal.primaryCategoryName,
            secondaryCategoryId: categoryTotal.secondaryCategoryId,
            secondaryCategoryName: categoryTotal.secondaryCategoryName,
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
        primaryCategoryId: string | null;
        primaryCategoryName: string | null;
        secondaryCategoryId: string | null;
        secondaryCategoryName: string | null;
        total: Prisma.Decimal;
      }
    >,
    categoryId: string | null,
    name: string,
    hierarchy: ReturnType<typeof getCategoryHierarchyMetadata>,
    amount: Prisma.Decimal,
  ): void {
    const key = categoryId ?? 'uncategorized';
    const existing = totals.get(key) ?? {
      categoryId,
      name,
      primaryCategoryId: hierarchy.primaryCategoryId,
      primaryCategoryName: hierarchy.primaryCategoryName,
      secondaryCategoryId: hierarchy.secondaryCategoryId,
      secondaryCategoryName: hierarchy.secondaryCategoryName,
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
        primaryCategoryId: string | null;
        primaryCategoryName: string | null;
        secondaryCategoryId: string | null;
        secondaryCategoryName: string | null;
        total: Prisma.Decimal;
      }
    >,
  ): MonthlyCashflowCategoryTotalResponse[] {
    return Array.from(totals.values())
      .map((total) => ({
        categoryId: total.categoryId,
        name: total.name,
        primaryCategoryId: total.primaryCategoryId,
        primaryCategoryName: total.primaryCategoryName,
        secondaryCategoryId: total.secondaryCategoryId,
        secondaryCategoryName: total.secondaryCategoryName,
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
          primaryCategoryId: string | null;
          primaryCategoryName: string | null;
          secondaryCategoryId: string | null;
          secondaryCategoryName: string | null;
          total: Prisma.Decimal;
        }
      >;
      incomeCategories: Map<
        string,
        {
          categoryId: string | null;
          name: string;
          primaryCategoryId: string | null;
          primaryCategoryName: string | null;
          secondaryCategoryId: string | null;
          secondaryCategoryName: string | null;
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

  private decimalsClose(
    left: Prisma.Decimal,
    right: Prisma.Decimal,
    tolerance = new Prisma.Decimal('0.000001'),
  ): boolean {
    return left.sub(right).abs().lte(tolerance);
  }

  /**
   * Pre-flight check: ensures the account can support this transaction.
   *
   * For OUTFLOW: the account must have a CASH asset with enough balance.
   * For INFLOW: no validation needed (auto-creation handled by adjust).
   */
  private async validateAccountCashBalance(
    ownerId: string,
    accountId: string,
    amount: Prisma.Decimal,
    direction: TransactionDirection,
    client: TransactionWriteClient = this.prisma,
  ): Promise<void> {
    if (direction !== TransactionDirection.OUTFLOW) return;

    // Liability accounts (CARD, LOAN) don't require cash validation —
    // outflows increase the debt rather than spending cash.
    if (await this.isLiabilityAccount(ownerId, accountId, client)) {
      return;
    }

    const cashAsset = await client.asset.findFirst({
      where: {
        userId: ownerId,
        accountId,
        kind: AssetKind.CASH,
        type: AssetType.ASSET,
      },
      select: { balance: true, currency: true },
    });

    if (!cashAsset) {
      throw new BadRequestException(
        'This account has no cash holding to draw from.',
      );
    }

    if (cashAsset.balance.lt(amount)) {
      throw new BadRequestException(
        `Insufficient cash balance in this account (available: ${cashAsset.balance.toFixed(2)} ${cashAsset.currency}).`,
      );
    }
  }

  /**
   * Adjust the asset balance in an account to reflect a transaction.
   *
   * For standard accounts (BANK, BROKER, CASH, OTHER):
   *   INFLOW  → cash balance goes up   (income, transfer-in)
   *   OUTFLOW → cash balance goes down  (expense, transfer-out)
   *   Auto-creates a cash asset on first inflow.
   *
   * For liability accounts (CARD, LOAN):
   *   OUTFLOW → liability balance goes up   (new expense on credit)
   *   INFLOW  → liability balance goes down  (debt payment)
   *   Auto-creates a liability asset on first outflow.
   *
   * Set `skipValidation` to true for reversals (update/delete) where the
   * balance was already validated on the original transaction.
   */
  private async adjustAccountCashBalance(
    ownerId: string,
    accountId: string,
    amount: Prisma.Decimal,
    direction: TransactionDirection,
    client: TransactionWriteClient = this.prisma,
    options?: { skipValidation?: boolean },
  ): Promise<void> {
    if (await this.isLiabilityAccount(ownerId, accountId, client)) {
      return this.adjustAccountLiabilityBalance(
        ownerId,
        accountId,
        amount,
        direction,
        client,
      );
    }

    const cashAsset = await client.asset.findFirst({
      where: {
        userId: ownerId,
        accountId,
        kind: AssetKind.CASH,
        type: AssetType.ASSET,
      },
      select: { id: true, balance: true, currency: true },
    });

    if (direction === TransactionDirection.OUTFLOW) {
      if (!options?.skipValidation) {
        if (!cashAsset) {
          throw new BadRequestException(
            'This account has no cash holding to draw from.',
          );
        }

        if (cashAsset.balance.lt(amount)) {
          throw new BadRequestException(
            `Insufficient cash balance in this account (available: ${cashAsset.balance.toFixed(2)} ${cashAsset.currency}).`,
          );
        }
      }

      if (!cashAsset) return;

      await client.asset.update({
        where: { id: cashAsset.id },
        data: { balance: cashAsset.balance.sub(amount) },
      });
      return;
    }

    // INFLOW: auto-create a cash asset if one doesn't exist yet
    if (!cashAsset) {
      const account = await client.account.findFirst({
        where: { id: accountId, userId: ownerId },
        select: { currency: true, name: true },
      });

      if (!account) return;

      await client.asset.create({
        data: {
          userId: ownerId,
          accountId,
          name: `${account.name} Cash`,
          type: AssetType.ASSET,
          kind: AssetKind.CASH,
          balance: amount,
          currency: account.currency,
        },
      });
      return;
    }

    await client.asset.update({
      where: { id: cashAsset.id },
      data: { balance: cashAsset.balance.add(amount) },
    });
  }

  /**
   * Check whether an account is a liability-type account (CARD or LOAN).
   * For these accounts, transactions adjust the liability asset instead
   * of the cash asset.
   */
  private async isLiabilityAccount(
    ownerId: string,
    accountId: string,
    client: TransactionWriteClient = this.prisma,
  ): Promise<boolean> {
    const account = await client.account.findFirst({
      where: { id: accountId, userId: ownerId },
      select: { type: true },
    });
    return (
      account?.type === AccountType.CARD || account?.type === AccountType.LOAN
    );
  }

  /**
   * Adjust the LIABILITY asset balance in a CARD/LOAN account.
   *
   * OUTFLOW → liability increases (new expense on credit)
   * INFLOW  → liability decreases (debt payment / refund)
   *
   * Auto-creates a liability asset on the first outflow.
   */
  private async adjustAccountLiabilityBalance(
    ownerId: string,
    accountId: string,
    amount: Prisma.Decimal,
    direction: TransactionDirection,
    client: TransactionWriteClient,
  ): Promise<void> {
    const liabilityAsset = await client.asset.findFirst({
      where: {
        userId: ownerId,
        accountId,
        type: AssetType.LIABILITY,
      },
      select: { id: true, balance: true },
    });

    if (direction === TransactionDirection.OUTFLOW) {
      // OUTFLOW on a liability account → debt increases
      if (!liabilityAsset) {
        const account = await client.account.findFirst({
          where: { id: accountId, userId: ownerId },
          select: { currency: true, name: true },
        });

        if (!account) return;

        await client.asset.create({
          data: {
            userId: ownerId,
            accountId,
            name: `${account.name} Debt`,
            type: AssetType.LIABILITY,
            liabilityKind: LiabilityKind.DEBT,
            balance: amount,
            currency: account.currency,
          },
        });
        return;
      }

      await client.asset.update({
        where: { id: liabilityAsset.id },
        data: { balance: liabilityAsset.balance.add(amount) },
      });
      return;
    }

    // INFLOW on a liability account → debt decreases (payment)
    if (!liabilityAsset) {
      throw new BadRequestException(
        'This account has no liability to pay off.',
      );
    }

    await client.asset.update({
      where: { id: liabilityAsset.id },
      data: { balance: liabilityAsset.balance.sub(amount) },
    });
  }
}
