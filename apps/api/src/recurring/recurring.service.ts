import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AccountsService } from '@accounts/accounts.service';
import type { AccountReconciliationModel } from '@accounts/accounts.service';
import { BudgetsService } from '@budgets/budgets.service';
import { PrismaService } from '@prisma/prisma.service';
import { CategoriesService } from '@transactions/categories.service';
import { TransactionsService } from '@transactions/transactions.service';
import { romeDateTimeToUtc } from '@transactions/transactions.dates';
import {
  Account,
  Category,
  NetWorthSnapshot,
  OperationType,
  Prisma,
  RecurringTransactionRule,
  RecurringTransactionOccurrence,
  TransactionDirection,
  TransactionKind,
} from '@prisma/client';
import type {
  CashflowSummaryResponse,
  MaterializeRecurringRulesResponse,
  MonthlyBudgetCurrencySummaryResponse,
  MonthlyBudgetItemResponse,
  MonthlyCashflowMonthResponse,
  MonthlyCashflowResponse,
  MonthlyReviewCurrencyInsightResponse,
  MonthlyReviewNetWorthExplanationResponse,
  MonthlyReviewRecurringComparisonResponse,
  MonthlyReviewResponse,
  MonthlyReviewWarningCode,
  MonthlyReviewWarningResponse,
} from '@finhance/shared';
import { toMonthlyReviewResponse } from '@recurring/recurring.mapper';
import { CreateRecurringTransactionRuleDto } from '@recurring/dto/create-recurring-transaction-rule.dto';
import { UpsertRecurringOccurrenceDto } from '@recurring/dto/upsert-recurring-occurrence.dto';
import { UpdateRecurringTransactionRuleDto } from '@recurring/dto/update-recurring-transaction-rule.dto';
import { OperationLockService } from '@/request-safety/operation-lock.service';

const ROME_TIME_ZONE = 'Europe/Rome';
const ZERO = new Prisma.Decimal(0);
const MAX_RECURRING_BACKFILL_MONTHS = 24;
const RECURRING_MATERIALIZE_COOLDOWN_MS = 1000 * 15;
const USER_VISIBLE_MATERIALIZATION_ERROR =
  'Unable to materialize this recurring rule. Review the rule configuration and try again.';
const MONTH_KEY_FORMATTER = new Intl.DateTimeFormat('en-CA', {
  timeZone: ROME_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
});
const DATE_KEY_FORMATTER = new Intl.DateTimeFormat('en-CA', {
  timeZone: ROME_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

interface PreparedStandardRuleTargets {
  kind: 'STANDARD';
  account: Account;
  category: Category | null;
}

interface PreparedTransferRuleTargets {
  kind: 'TRANSFER';
  sourceAccount: Account;
  destinationAccount: Account;
}

type PreparedRuleTargets =
  | PreparedStandardRuleTargets
  | PreparedTransferRuleTargets;

interface PreparedRecurringRuleInput {
  userId: string;
  name: string;
  isActive: boolean;
  kind: TransactionKind;
  amount: Prisma.Decimal;
  dayOfMonth: number;
  startDate: Date;
  endDate: Date | null;
  accountId: string | null;
  direction: TransactionDirection | null;
  categoryId: string | null;
  counterparty: string | null;
  sourceAccountId: string | null;
  destinationAccountId: string | null;
  description: string;
  notes: string | null;
}

interface ExistingOccurrenceMapEntry {
  INFLOW: boolean;
  OUTFLOW: boolean;
}

type TransactionWriteClient = PrismaService | Prisma.TransactionClient;
type RecurringMaterializationClient = PrismaService | Prisma.TransactionClient;

type RecurringOccurrenceModel =
  Prisma.RecurringTransactionOccurrenceGetPayload<{
    include: {
      recurringRule: true;
    };
  }>;

interface SkippedOccurrenceInput {
  status: 'SKIPPED';
}

interface StandardOccurrenceSpec {
  kind: 'STANDARD';
  postedAt: Date;
  amount: Prisma.Decimal;
  accountId: string;
  currency: string;
  direction: TransactionDirection;
  categoryId: string | null;
  description: string;
  notes: string | null;
  counterparty: string | null;
}

interface TransferOccurrenceSpec {
  kind: 'TRANSFER';
  postedAt: Date;
  amount: Prisma.Decimal;
  sourceAccountId: string;
  destinationAccountId: string;
  currency: string;
  description: string;
  notes: string | null;
}

type MaterializedOccurrenceSpec =
  | StandardOccurrenceSpec
  | TransferOccurrenceSpec;

interface OverriddenOccurrenceInput {
  status: 'OVERRIDDEN';
  overrideAmount: Prisma.Decimal;
  overridePostedAtDate: Date;
  overrideAccountId: string | null;
  overrideDirection: TransactionDirection | null;
  overrideCategoryId: string | null;
  overrideCounterparty: string | null;
  overrideSourceAccountId: string | null;
  overrideDestinationAccountId: string | null;
  overrideDescription: string;
  overrideNotes: string | null;
  spec: MaterializedOccurrenceSpec;
}

type PreparedOccurrenceInput =
  | SkippedOccurrenceInput
  | OverriddenOccurrenceInput;

interface RecurringMonthTransactionRow {
  recurringRuleId: string;
  kind: TransactionKind;
  currency: string;
  amount: Prisma.Decimal;
  direction: TransactionDirection | null;
}

interface RecurringComparisonBucket {
  currency: string;
  expectedIncomeTotal: number;
  actualIncomeTotal: number;
  expectedExpenseTotal: number;
  actualExpenseTotal: number;
  dueRuleCount: number;
  realizedRuleCount: number;
  skippedCount: number;
  overriddenCount: number;
  transferRulesExcludedCount: number;
}

@Injectable()
export class RecurringService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accountsService: AccountsService,
    private readonly budgetsService: BudgetsService,
    private readonly categoriesService: CategoriesService,
    private readonly transactionsService: TransactionsService,
    private readonly operationLockService: OperationLockService,
  ) {}

  async findAll(ownerId: string): Promise<RecurringTransactionRule[]> {
    return this.prisma.recurringTransactionRule.findMany({
      where: { userId: ownerId },
      orderBy: [
        { isActive: 'desc' },
        { dayOfMonth: 'asc' },
        { createdAt: 'asc' },
      ],
    });
  }

  async findOne(
    ownerId: string,
    id: string,
  ): Promise<RecurringTransactionRule> {
    const rule = await this.prisma.recurringTransactionRule.findFirst({
      where: { userId: ownerId, id },
    });

    if (!rule) {
      throw new NotFoundException(`Recurring rule ${id} was not found.`);
    }

    return rule;
  }

  async create(
    ownerId: string,
    dto: CreateRecurringTransactionRuleDto,
  ): Promise<RecurringTransactionRule> {
    const prepared = await this.prepareRuleInput(ownerId, dto);

    return this.prisma.recurringTransactionRule.create({
      data: prepared,
    });
  }

  async update(
    ownerId: string,
    id: string,
    dto: UpdateRecurringTransactionRuleDto,
  ): Promise<RecurringTransactionRule> {
    await this.findOne(ownerId, id);
    const prepared = await this.prepareRuleInput(ownerId, dto);

    return this.prisma.recurringTransactionRule.update({
      where: { id },
      data: {
        ...prepared,
        lastMaterializationError: null,
        lastMaterializationErrorAt: null,
      },
    });
  }

  async remove(ownerId: string, id: string): Promise<void> {
    await this.findOne(ownerId, id);
    await this.prisma.recurringTransactionRule.update({
      where: { id },
      data: { isActive: false },
    });
  }

  async findOccurrences(
    ownerId: string,
    ruleId: string,
    filters?: {
      from?: string;
      to?: string;
    },
  ): Promise<RecurringOccurrenceModel[]> {
    await this.findOne(ownerId, ruleId);
    const range = this.resolveOptionalMonthRange(filters?.from, filters?.to);

    return this.prisma.recurringTransactionOccurrence.findMany({
      where: {
        userId: ownerId,
        recurringRuleId: ruleId,
        ...(range.from || range.to
          ? {
              occurrenceMonth: {
                ...(range.from
                  ? { gte: this.monthKeyToValue(range.from) }
                  : {}),
                ...(range.to ? { lte: this.monthKeyToValue(range.to) } : {}),
              },
            }
          : {}),
      },
      include: {
        recurringRule: true,
      },
      orderBy: [{ occurrenceMonth: 'desc' }, { createdAt: 'desc' }],
    });
  }

  async upsertOccurrence(
    ownerId: string,
    ruleId: string,
    monthKey: string,
    dto: UpsertRecurringOccurrenceDto,
  ): Promise<RecurringOccurrenceModel> {
    const rule = await this.findOne(ownerId, ruleId);
    this.requireMonthKey(monthKey, 'month');
    this.assertOccurrenceMonthAllowed(rule, monthKey);

    const prepared = await this.prepareOccurrenceInput(
      ownerId,
      rule,
      monthKey,
      dto,
    );
    const currentMonthKey = this.formatMonthKey(new Date());
    const occurrenceMonth = this.monthKeyToValue(monthKey);
    const overrideData =
      prepared.status === 'OVERRIDDEN'
        ? {
            overrideAmount: prepared.overrideAmount,
            overridePostedAtDate: prepared.overridePostedAtDate,
            overrideAccountId: prepared.overrideAccountId,
            overrideDirection: prepared.overrideDirection,
            overrideCategoryId: prepared.overrideCategoryId,
            overrideCounterparty: prepared.overrideCounterparty,
            overrideSourceAccountId: prepared.overrideSourceAccountId,
            overrideDestinationAccountId: prepared.overrideDestinationAccountId,
            overrideDescription: prepared.overrideDescription,
            overrideNotes: prepared.overrideNotes,
          }
        : {
            overrideAmount: null,
            overridePostedAtDate: null,
            overrideAccountId: null,
            overrideDirection: null,
            overrideCategoryId: null,
            overrideCounterparty: null,
            overrideSourceAccountId: null,
            overrideDestinationAccountId: null,
            overrideDescription: null,
            overrideNotes: null,
          };

    return this.prisma.$transaction(async (tx) => {
      const occurrence = await tx.recurringTransactionOccurrence.upsert({
        where: {
          recurringRuleId_occurrenceMonth: {
            recurringRuleId: rule.id,
            occurrenceMonth,
          },
        },
        create: {
          userId: ownerId,
          recurringRuleId: rule.id,
          occurrenceMonth,
          status: prepared.status,
          ...overrideData,
        },
        update: {
          status: prepared.status,
          ...overrideData,
        },
        include: {
          recurringRule: true,
        },
      });

      if (monthKey <= currentMonthKey) {
        await this.replaceOccurrenceTransactions(
          tx,
          ownerId,
          rule,
          monthKey,
          prepared.status === 'SKIPPED' ? null : prepared.spec,
        );
      }

      await tx.recurringTransactionRule.update({
        where: { id: rule.id },
        data: {
          lastMaterializationError: null,
          lastMaterializationErrorAt: null,
        },
      });

      return occurrence;
    });
  }

  async clearOccurrence(
    ownerId: string,
    ruleId: string,
    monthKey: string,
  ): Promise<void> {
    const rule = await this.findOne(ownerId, ruleId);
    this.requireMonthKey(monthKey, 'month');
    const currentMonthKey = this.formatMonthKey(new Date());
    const occurrenceMonth = this.monthKeyToValue(monthKey);

    await this.prisma.$transaction(async (tx) => {
      await tx.recurringTransactionOccurrence.deleteMany({
        where: {
          userId: ownerId,
          recurringRuleId: rule.id,
          occurrenceMonth,
        },
      });

      if (monthKey > currentMonthKey) {
        return;
      }

      if (this.isOccurrenceMonthApplicable(rule, monthKey)) {
        const targets = await this.resolveRuleTargets(ownerId, {
          kind: rule.kind,
          accountId: rule.accountId,
          direction: rule.direction,
          categoryId: rule.categoryId,
          counterparty: rule.counterparty,
          sourceAccountId: rule.sourceAccountId,
          destinationAccountId: rule.destinationAccountId,
          description: rule.description,
          notes: rule.notes,
          dayOfMonth: rule.dayOfMonth,
          startDate: rule.startDate,
          endDate: rule.endDate,
        });

        await this.replaceOccurrenceTransactions(
          tx,
          ownerId,
          rule,
          monthKey,
          this.buildDefaultOccurrenceSpec(rule, targets, monthKey),
        );
      } else {
        await this.deleteOccurrenceTransactions(tx, ownerId, rule.id, monthKey);
      }

      await tx.recurringTransactionRule.update({
        where: { id: rule.id },
        data: {
          lastMaterializationError: null,
          lastMaterializationErrorAt: null,
        },
      });
    });
  }

  async materialize(
    ownerId: string,
  ): Promise<MaterializeRecurringRulesResponse> {
    return this.operationLockService.runExclusive(
      {
        userId: ownerId,
        type: OperationType.RECURRING_MATERIALIZE,
        inProgressMessage: 'Recurring materialization already in progress.',
        cooldownMs: RECURRING_MATERIALIZE_COOLDOWN_MS,
        cooldownMessage: (remainingSeconds) =>
          `Recurring materialization is cooling down. Try again in ${remainingSeconds}s.`,
      },
      async () => {
        const rules = await this.prisma.recurringTransactionRule.findMany({
          where: {
            userId: ownerId,
            isActive: true,
          },
          orderBy: [{ dayOfMonth: 'asc' }, { createdAt: 'asc' }],
        });

        if (rules.length === 0) {
          return {
            createdCount: 0,
            processedRuleCount: 0,
            failedRuleCount: 0,
          };
        }

        const currentMonthKey = this.formatMonthKey(new Date());
        let createdCount = 0;
        let failedRuleCount = 0;

        for (const rule of rules) {
          try {
            const targets = await this.resolveRuleTargets(ownerId, {
              kind: rule.kind,
              accountId: rule.accountId,
              direction: rule.direction,
              categoryId: rule.categoryId,
              counterparty: rule.counterparty,
              sourceAccountId: rule.sourceAccountId,
              destinationAccountId: rule.destinationAccountId,
              description: rule.description,
              notes: rule.notes,
              dayOfMonth: rule.dayOfMonth,
              startDate: rule.startDate,
              endDate: rule.endDate,
            });
            const dueMonthKeys = this.listApplicableMonthKeys(
              rule,
              currentMonthKey,
            );
            let createdForRule = 0;

            for (const monthKey of dueMonthKeys) {
              createdForRule += await this.prisma.$transaction(
                async (tx) =>
                  this.materializeRuleMonth(
                    tx,
                    ownerId,
                    rule,
                    monthKey,
                    targets,
                  ),
                {
                  isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
                },
              );
            }

            createdCount += createdForRule;
            await this.clearMaterializationError(rule.id);
          } catch (error) {
            failedRuleCount += 1;
            void error;
            await this.persistMaterializationError(rule.id);
          }
        }

        return {
          createdCount,
          processedRuleCount: rules.length,
          failedRuleCount,
        };
      },
    );
  }

  private async materializeRuleMonth(
    client: RecurringMaterializationClient,
    ownerId: string,
    rule: RecurringTransactionRule,
    monthKey: string,
    targets: PreparedRuleTargets,
  ): Promise<number> {
    const occurrenceMonth = this.monthKeyToValue(monthKey);
    const [rows, occurrenceException] = await Promise.all([
      client.transaction.findMany({
        where: {
          userId: ownerId,
          recurringRuleId: rule.id,
          recurringOccurrenceMonth: occurrenceMonth,
        },
        select: {
          direction: true,
        },
      }),
      client.recurringTransactionOccurrence.findFirst({
        where: {
          userId: ownerId,
          recurringRuleId: rule.id,
          occurrenceMonth,
        },
      }),
    ]);
    const existing = this.buildExistingOccurrenceEntry(rows);

    if (occurrenceException?.status === 'SKIPPED') {
      await this.deleteOccurrenceTransactions(
        client,
        ownerId,
        rule.id,
        monthKey,
      );
      return 0;
    }

    if (occurrenceException?.status === 'OVERRIDDEN') {
      const preparedOccurrence = await this.prepareStoredOccurrenceOverride(
        ownerId,
        rule,
        monthKey,
        occurrenceException,
      );
      const createdRows = this.countNewRows(existing, preparedOccurrence.spec);

      await this.replaceOccurrenceTransactions(
        client,
        ownerId,
        rule,
        monthKey,
        preparedOccurrence.spec,
      );

      return createdRows;
    }

    const defaultSpec = this.buildDefaultOccurrenceSpec(
      rule,
      targets,
      monthKey,
    );

    if (defaultSpec.kind === 'TRANSFER') {
      if (targets.kind !== 'TRANSFER') {
        throw new Error('Transfer materialization requires transfer targets.');
      }

      const { sourceAccount, destinationAccount } = targets;
      const createdRows = this.countNewRows(existing, defaultSpec);

      if (createdRows === 0) {
        return 0;
      }

      if (!existing.OUTFLOW) {
        await client.transaction.create({
          data: {
            userId: ownerId,
            postedAt: defaultSpec.postedAt,
            accountId: sourceAccount.id,
            categoryId: null,
            amount: defaultSpec.amount,
            currency: sourceAccount.currency,
            direction: TransactionDirection.OUTFLOW,
            kind: TransactionKind.TRANSFER,
            description: defaultSpec.description,
            notes: defaultSpec.notes,
            counterparty: null,
            transferGroupId: this.transferGroupId(rule.id, monthKey),
            recurringRuleId: rule.id,
            recurringOccurrenceMonth: occurrenceMonth,
          },
        });
      }

      if (!existing.INFLOW) {
        await client.transaction.create({
          data: {
            userId: ownerId,
            postedAt: defaultSpec.postedAt,
            accountId: destinationAccount.id,
            categoryId: null,
            amount: defaultSpec.amount,
            currency: destinationAccount.currency,
            direction: TransactionDirection.INFLOW,
            kind: TransactionKind.TRANSFER,
            description: defaultSpec.description,
            notes: defaultSpec.notes,
            counterparty: null,
            transferGroupId: this.transferGroupId(rule.id, monthKey),
            recurringRuleId: rule.id,
            recurringOccurrenceMonth: occurrenceMonth,
          },
        });
      }

      return createdRows;
    }

    if (targets.kind !== 'STANDARD') {
      throw new Error('Standard materialization requires standard targets.');
    }

    const { account, category } = targets;

    if (this.hasMismatchedExistingRows(existing, defaultSpec)) {
      await this.replaceOccurrenceTransactions(
        client,
        ownerId,
        rule,
        monthKey,
        defaultSpec,
      );
      return 0;
    }

    if (existing[defaultSpec.direction]) {
      return 0;
    }

    await client.transaction.create({
      data: {
        userId: ownerId,
        postedAt: defaultSpec.postedAt,
        accountId: account.id,
        categoryId: category?.id ?? null,
        amount: defaultSpec.amount,
        currency: account.currency,
        direction: defaultSpec.direction,
        kind: rule.kind,
        description: defaultSpec.description,
        notes: defaultSpec.notes,
        counterparty: defaultSpec.counterparty,
        transferGroupId: null,
        recurringRuleId: rule.id,
        recurringOccurrenceMonth: occurrenceMonth,
      },
    });

    return 1;
  }

  async getMonthlyReview(
    ownerId: string,
    month: string,
  ): Promise<MonthlyReviewResponse> {
    const range = this.resolveMonthRange(month);
    const occurrenceMonth = this.monthKeyToValue(month);
    const [
      cashflow,
      monthlyCashflow,
      budgetView,
      openingSnapshot,
      closingSnapshot,
      accounts,
      reconciliations,
      recurringExceptions,
      recurringRules,
      recurringRows,
    ] = await Promise.all([
      this.transactionsService.getCashflowSummary(ownerId, {
        from: range.from,
        to: range.to,
        includeArchivedAccounts: true,
      }),
      this.transactionsService.getMonthlyCashflow(ownerId, {
        from: month,
        to: month,
        includeArchivedAccounts: true,
      }),
      this.budgetsService.findMonthly(ownerId, month, {
        includeArchivedCategories: true,
      }),
      this.findLatestSnapshotOnOrBefore(ownerId, range.openingSnapshotCutoff),
      this.findLatestSnapshotOnOrBefore(ownerId, range.closingSnapshotCutoff),
      this.accountsService.findAll(ownerId, { includeArchived: true }),
      this.accountsService.findReconciliation(ownerId),
      this.prisma.recurringTransactionOccurrence.findMany({
        where: {
          userId: ownerId,
          occurrenceMonth,
        },
        include: {
          recurringRule: true,
        },
        orderBy: [{ createdAt: 'asc' }],
      }),
      this.prisma.recurringTransactionRule.findMany({
        where: {
          userId: ownerId,
        },
        orderBy: [{ dayOfMonth: 'asc' }, { createdAt: 'asc' }],
      }),
      this.prisma.transaction.findMany({
        where: {
          userId: ownerId,
          recurringRuleId: {
            not: null,
          },
          recurringOccurrenceMonth: occurrenceMonth,
        },
        select: {
          recurringRuleId: true,
          kind: true,
          currency: true,
          amount: true,
          direction: true,
        },
      }),
    ]);
    const reconciliationHighlights = reconciliations.filter(
      (reconciliation) => reconciliation.status !== 'CLEAN',
    );
    const netWorthExplanation = this.buildMonthlyReviewNetWorthExplanation(
      cashflow,
      openingSnapshot,
      closingSnapshot,
    );
    const recurringComparison = this.buildRecurringComparison(
      month,
      recurringRules,
      recurringExceptions,
      recurringRows.flatMap((row) =>
        row.recurringRuleId
          ? [
              {
                recurringRuleId: row.recurringRuleId,
                kind: row.kind,
                currency: row.currency,
                amount: row.amount,
                direction: row.direction,
              } satisfies RecurringMonthTransactionRow,
            ]
          : [],
      ),
      accounts,
    );
    const currencyInsights = this.buildMonthlyReviewCurrencyInsights(
      cashflow,
      monthlyCashflow,
      month,
    );
    const budgetHighlights = this.buildMonthlyReviewBudgetHighlights(
      budgetView.currencies,
    );
    const warnings = this.buildMonthlyReviewWarnings({
      cashflow,
      openingSnapshot,
      closingSnapshot,
      netWorthExplanation,
      reconciliationHighlights,
      recurringExceptions,
      currencyInsights,
      budgetSummary: budgetView.currencies,
    });

    return toMonthlyReviewResponse({
      month,
      cashflow,
      openingSnapshot,
      closingSnapshot,
      warnings,
      netWorthExplanation,
      recurringComparison,
      currencyInsights,
      budgetSummary: budgetView.currencies,
      budgetHighlights,
      reconciliationHighlights,
      recurringExceptions,
    });
  }

  private buildMonthlyReviewNetWorthExplanation(
    cashflow: CashflowSummaryResponse,
    openingSnapshot: NetWorthSnapshot | null,
    closingSnapshot: NetWorthSnapshot | null,
  ): MonthlyReviewNetWorthExplanationResponse {
    if (!openingSnapshot || !closingSnapshot) {
      return {
        isComparableInEur: false,
        cashflowContributionEur: null,
        valuationMovementEur: null,
        note: 'Add both opening and closing snapshot boundaries to explain the month in EUR.',
      };
    }

    if (openingSnapshot.isPartial || closingSnapshot.isPartial) {
      return {
        isComparableInEur: false,
        cashflowContributionEur: null,
        valuationMovementEur: null,
        note: 'Snapshot boundaries are partial, so the EUR net worth delta cannot be decomposed safely.',
      };
    }

    const nonEurBuckets = cashflow.filter(
      (bucket) => bucket.currency !== 'EUR',
    );
    if (nonEurBuckets.length > 0) {
      return {
        isComparableInEur: false,
        cashflowContributionEur: null,
        valuationMovementEur: null,
        note: 'Cashflow includes non-EUR currencies, so the EUR net worth delta cannot be decomposed safely.',
      };
    }

    const openingNetWorth = openingSnapshot.netWorthTotal.toNumber();
    const closingNetWorth = closingSnapshot.netWorthTotal.toNumber();
    const cashflowContributionEur =
      cashflow.find((bucket) => bucket.currency === 'EUR')?.netCashflow ?? 0;

    return {
      isComparableInEur: true,
      cashflowContributionEur,
      valuationMovementEur:
        closingNetWorth - openingNetWorth - cashflowContributionEur,
      note: 'Valuation movement is the portion of the EUR net worth delta not explained by EUR cashflow.',
    };
  }

  private buildRecurringComparison(
    monthKey: string,
    rules: RecurringTransactionRule[],
    recurringExceptions: RecurringOccurrenceModel[],
    recurringRows: RecurringMonthTransactionRow[],
    accounts: Account[],
  ): MonthlyReviewRecurringComparisonResponse[] {
    const accountsById = new Map(
      accounts.map((account) => [account.id, account]),
    );
    const occurrencesByRuleId = new Map(
      recurringExceptions.map((occurrence) => [
        occurrence.recurringRuleId,
        occurrence,
      ]),
    );
    const rowsByRuleId = new Map<string, RecurringMonthTransactionRow[]>();

    for (const row of recurringRows) {
      const existing = rowsByRuleId.get(row.recurringRuleId) ?? [];
      existing.push(row);
      rowsByRuleId.set(row.recurringRuleId, existing);
    }

    const persistedRuleIds = new Set<string>([
      ...occurrencesByRuleId.keys(),
      ...rowsByRuleId.keys(),
    ]);
    const buckets = new Map<string, RecurringComparisonBucket>();

    for (const rule of rules) {
      const hasPersistedMonthState = persistedRuleIds.has(rule.id);
      const isApplicable = this.isOccurrenceMonthApplicable(rule, monthKey);

      if (!hasPersistedMonthState && (!rule.isActive || !isApplicable)) {
        continue;
      }

      const occurrence = occurrencesByRuleId.get(rule.id) ?? null;
      const rows = rowsByRuleId.get(rule.id) ?? [];
      const currency = this.resolveRecurringComparisonCurrency(
        rule,
        occurrence,
        rows,
        accountsById,
      );
      const bucket =
        buckets.get(currency) ?? this.createRecurringComparisonBucket(currency);

      bucket.dueRuleCount += 1;
      if (rows.length > 0) {
        bucket.realizedRuleCount += 1;
      }

      if (occurrence?.status === 'SKIPPED') {
        bucket.skippedCount += 1;
      }

      if (occurrence?.status === 'OVERRIDDEN') {
        bucket.overriddenCount += 1;
      }

      if (rule.kind === TransactionKind.TRANSFER) {
        bucket.transferRulesExcludedCount += 1;
        buckets.set(currency, bucket);
        continue;
      }

      const expectedAmount =
        occurrence?.status === 'OVERRIDDEN' && occurrence.overrideAmount
          ? occurrence.overrideAmount.toNumber()
          : rule.amount.toNumber();
      const actualAmount =
        occurrence?.status === 'SKIPPED'
          ? 0
          : rows.reduce((sum, row) => sum + row.amount.toNumber(), 0);
      const direction = this.resolveRecurringComparisonDirection(
        rule,
        occurrence,
        rows,
      );

      if (direction === TransactionDirection.INFLOW) {
        bucket.expectedIncomeTotal += expectedAmount;
        bucket.actualIncomeTotal += actualAmount;
      } else {
        bucket.expectedExpenseTotal += expectedAmount;
        bucket.actualExpenseTotal += actualAmount;
      }

      buckets.set(currency, bucket);
    }

    return [...buckets.values()]
      .sort((left, right) => left.currency.localeCompare(right.currency))
      .map((bucket) => ({
        currency: bucket.currency,
        expectedIncomeTotal: bucket.expectedIncomeTotal,
        actualIncomeTotal: bucket.actualIncomeTotal,
        expectedExpenseTotal: bucket.expectedExpenseTotal,
        actualExpenseTotal: bucket.actualExpenseTotal,
        dueRuleCount: bucket.dueRuleCount,
        realizedRuleCount: bucket.realizedRuleCount,
        skippedCount: bucket.skippedCount,
        overriddenCount: bucket.overriddenCount,
        transferRulesExcludedCount: bucket.transferRulesExcludedCount,
      }));
  }

  private resolveRecurringComparisonCurrency(
    rule: RecurringTransactionRule,
    occurrence: RecurringOccurrenceModel | null,
    rows: RecurringMonthTransactionRow[],
    accountsById: Map<string, Account>,
  ): string {
    const rowCurrency = rows[0]?.currency ?? null;
    const accountId =
      rule.kind === TransactionKind.TRANSFER
        ? occurrence?.status === 'OVERRIDDEN'
          ? (occurrence.overrideSourceAccountId ?? rule.sourceAccountId)
          : rule.sourceAccountId
        : occurrence?.status === 'OVERRIDDEN'
          ? (occurrence.overrideAccountId ?? rule.accountId)
          : rule.accountId;

    const accountCurrency = accountId
      ? (accountsById.get(accountId)?.currency ?? null)
      : null;

    return rowCurrency ?? accountCurrency ?? 'EUR';
  }

  private resolveRecurringComparisonDirection(
    rule: RecurringTransactionRule,
    occurrence: RecurringOccurrenceModel | null,
    rows: RecurringMonthTransactionRow[],
  ): TransactionDirection {
    if (occurrence?.status === 'OVERRIDDEN' && occurrence.overrideDirection) {
      return occurrence.overrideDirection;
    }

    const rowDirection = rows.find((row) => row.direction)?.direction;
    return rowDirection ?? rule.direction ?? TransactionDirection.OUTFLOW;
  }

  private createRecurringComparisonBucket(
    currency: string,
  ): RecurringComparisonBucket {
    return {
      currency,
      expectedIncomeTotal: 0,
      actualIncomeTotal: 0,
      expectedExpenseTotal: 0,
      actualExpenseTotal: 0,
      dueRuleCount: 0,
      realizedRuleCount: 0,
      skippedCount: 0,
      overriddenCount: 0,
      transferRulesExcludedCount: 0,
    };
  }

  private buildMonthlyReviewCurrencyInsights(
    cashflow: CashflowSummaryResponse,
    monthlyCashflow: MonthlyCashflowResponse,
    monthKey: string,
  ): MonthlyReviewCurrencyInsightResponse[] {
    const cashflowByCurrency = new Map(
      cashflow.map((bucket) => [bucket.currency, bucket]),
    );
    const monthlyByCurrency = new Map(
      monthlyCashflow.map((bucket) => [bucket.currency, bucket]),
    );
    const currencies = new Set<string>([
      ...cashflowByCurrency.keys(),
      ...monthlyByCurrency.keys(),
    ]);

    return [...currencies]
      .sort((left, right) => left.localeCompare(right))
      .map((currency) => {
        const cashflowBucket = cashflowByCurrency.get(currency);
        const monthlyBucket = monthlyByCurrency.get(currency);
        const month = monthlyBucket
          ? this.findMonthlyCashflowMonth(monthlyBucket, monthKey)
          : null;

        return {
          currency,
          savingsRate: month?.savingsRate ?? null,
          uncategorizedExpenseTotal: month?.uncategorizedExpenseTotal ?? 0,
          uncategorizedIncomeTotal: month?.uncategorizedIncomeTotal ?? 0,
          topExpenseCategories: this.sortAndLimitCategoryDrivers(
            month?.expenseCategories ?? [],
          ),
          topIncomeCategories: this.sortAndLimitCategoryDrivers(
            month?.incomeCategories ?? [],
          ),
          topAccounts: this.sortAndLimitAccountDrivers(
            cashflowBucket?.byAccount ?? [],
          ),
        };
      });
  }

  private findMonthlyCashflowMonth(
    bucket: MonthlyCashflowResponse[number],
    monthKey: string,
  ): MonthlyCashflowMonthResponse | null {
    return bucket.months.find((month) => month.month === monthKey) ?? null;
  }

  private sortAndLimitCategoryDrivers(
    items: MonthlyCashflowMonthResponse['expenseCategories'],
  ): MonthlyReviewCurrencyInsightResponse['topExpenseCategories'] {
    return [...items]
      .sort((left, right) => right.total - left.total)
      .slice(0, 3)
      .map((item) => ({
        categoryId: item.categoryId,
        name: item.name,
        total: item.total,
      }));
  }

  private sortAndLimitAccountDrivers(
    items: CashflowSummaryResponse[number]['byAccount'],
  ): MonthlyReviewCurrencyInsightResponse['topAccounts'] {
    return [...items]
      .sort(
        (left, right) =>
          Math.abs(right.netCashflow) - Math.abs(left.netCashflow),
      )
      .slice(0, 3)
      .map((item) => ({
        accountId: item.accountId,
        name: item.name,
        inflowTotal: item.inflowTotal,
        outflowTotal: item.outflowTotal,
        netCashflow: item.netCashflow,
      }));
  }

  private buildMonthlyReviewWarnings(input: {
    cashflow: CashflowSummaryResponse;
    openingSnapshot: NetWorthSnapshot | null;
    closingSnapshot: NetWorthSnapshot | null;
    netWorthExplanation: MonthlyReviewNetWorthExplanationResponse;
    reconciliationHighlights: AccountReconciliationModel[];
    recurringExceptions: RecurringOccurrenceModel[];
    currencyInsights: MonthlyReviewCurrencyInsightResponse[];
    budgetSummary: MonthlyBudgetCurrencySummaryResponse[];
  }): MonthlyReviewWarningResponse[] {
    const warnings: MonthlyReviewWarningResponse[] = [];

    if (!input.openingSnapshot) {
      warnings.push(
        this.createMonthlyReviewWarning({
          code: 'MISSING_OPENING_SNAPSHOT',
          severity: 'WARNING',
          title: 'Opening snapshot missing',
          detail:
            'Add a snapshot before this month to anchor the opening net worth boundary.',
        }),
      );
    } else if (input.openingSnapshot.isPartial) {
      warnings.push(
        this.createMonthlyReviewWarning({
          code: 'PARTIAL_OPENING_SNAPSHOT',
          severity: 'WARNING',
          title: 'Opening snapshot is partial',
          detail:
            'The opening boundary excludes unavailable valuations, so month-over-month comparisons are incomplete.',
          count: input.openingSnapshot.unavailableCount,
        }),
      );
    }

    if (!input.closingSnapshot) {
      warnings.push(
        this.createMonthlyReviewWarning({
          code: 'MISSING_CLOSING_SNAPSHOT',
          severity: 'WARNING',
          title: 'Closing snapshot missing',
          detail:
            'Capture a snapshot in this month to anchor the closing net worth boundary.',
        }),
      );
    } else if (input.closingSnapshot.isPartial) {
      warnings.push(
        this.createMonthlyReviewWarning({
          code: 'PARTIAL_CLOSING_SNAPSHOT',
          severity: 'WARNING',
          title: 'Closing snapshot is partial',
          detail:
            'The closing boundary excludes unavailable valuations, so the ending net worth is incomplete.',
          count: input.closingSnapshot.unavailableCount,
        }),
      );
    }

    if (!input.netWorthExplanation.isComparableInEur) {
      for (const bucket of input.cashflow.filter(
        (cashflowBucket) => cashflowBucket.currency !== 'EUR',
      )) {
        warnings.push(
          this.createMonthlyReviewWarning({
            code: 'NON_EUR_CASHFLOW_NOT_COMPARABLE',
            severity: 'INFO',
            title: `${bucket.currency} cashflow excluded from EUR explanation`,
            detail:
              'This month includes non-EUR cashflow, so the net worth delta cannot be decomposed into one EUR story.',
            amount: bucket.netCashflow,
            currency: bucket.currency,
          }),
        );
      }
    }

    for (const insight of input.currencyInsights) {
      if (insight.uncategorizedExpenseTotal > 0) {
        warnings.push(
          this.createMonthlyReviewWarning({
            code: 'UNCATEGORIZED_EXPENSES',
            severity: 'WARNING',
            title: `Uncategorized expenses in ${insight.currency}`,
            detail:
              'Some expense transactions are still uncategorized, so category drivers are incomplete.',
            amount: insight.uncategorizedExpenseTotal,
            currency: insight.currency,
          }),
        );
      }

      if (insight.uncategorizedIncomeTotal > 0) {
        warnings.push(
          this.createMonthlyReviewWarning({
            code: 'UNCATEGORIZED_INCOME',
            severity: 'WARNING',
            title: `Uncategorized income in ${insight.currency}`,
            detail:
              'Some income transactions are still uncategorized, so category drivers are incomplete.',
            amount: insight.uncategorizedIncomeTotal,
            currency: insight.currency,
          }),
        );
      }
    }

    for (const summary of input.budgetSummary) {
      if (summary.overBudgetCount > 0) {
        warnings.push(
          this.createMonthlyReviewWarning({
            code: 'OVER_BUDGET_CATEGORIES',
            severity: 'WARNING',
            title: `${summary.overBudgetCount} over-budget categor${
              summary.overBudgetCount === 1 ? 'y' : 'ies'
            } in ${summary.currency}`,
            detail:
              'Budgeted expense categories exceeded their monthly limits.',
            count: summary.overBudgetCount,
          }),
        );
      }

      if (summary.unbudgetedExpenseTotal > 0) {
        warnings.push(
          this.createMonthlyReviewWarning({
            code: 'UNBUDGETED_EXPENSES',
            severity: 'WARNING',
            title: `Unbudgeted expense in ${summary.currency}`,
            detail:
              'Some categorized expenses were recorded without a matching budget for this month.',
            amount: summary.unbudgetedExpenseTotal,
            currency: summary.currency,
          }),
        );
      }
    }

    if (input.reconciliationHighlights.length > 0) {
      warnings.push(
        this.createMonthlyReviewWarning({
          code: 'RECONCILIATION_ISSUES',
          severity: 'WARNING',
          title: 'Reconciliation needs attention',
          detail:
            'One or more accounts still have mismatches or unsupported reconciliation state.',
          count: input.reconciliationHighlights.length,
        }),
      );
    }

    if (input.recurringExceptions.length > 0) {
      warnings.push(
        this.createMonthlyReviewWarning({
          code: 'RECURRING_EXCEPTIONS_PRESENT',
          severity: 'INFO',
          title: 'Recurring exceptions saved for this month',
          detail:
            'This month includes skipped or overridden recurring occurrences that change the expected schedule.',
          count: input.recurringExceptions.length,
        }),
      );
    }

    return warnings;
  }

  private buildMonthlyReviewBudgetHighlights(
    summaries: MonthlyBudgetCurrencySummaryResponse[],
  ): MonthlyBudgetItemResponse[] {
    return summaries
      .flatMap((summary) => summary.items)
      .filter((item) => item.status === 'OVER_BUDGET')
      .sort(
        (left, right) =>
          right.spentAmount -
          right.budgetAmount -
          (left.spentAmount - left.budgetAmount),
      )
      .slice(0, 5);
  }

  private createMonthlyReviewWarning(input: {
    code: MonthlyReviewWarningCode;
    severity: MonthlyReviewWarningResponse['severity'];
    title: string;
    detail: string;
    count?: number;
    amount?: number;
    currency?: string;
  }): MonthlyReviewWarningResponse {
    return {
      code: input.code,
      severity: input.severity,
      title: input.title,
      detail: input.detail,
      count: input.count ?? null,
      amount: input.amount ?? null,
      currency: input.currency ?? null,
    };
  }

  private async prepareOccurrenceInput(
    ownerId: string,
    rule: RecurringTransactionRule,
    monthKey: string,
    dto: UpsertRecurringOccurrenceDto,
  ): Promise<PreparedOccurrenceInput> {
    if (dto.status === 'SKIPPED') {
      return {
        status: 'SKIPPED',
      };
    }

    if (dto.amount === undefined) {
      throw new BadRequestException('amount is required.');
    }

    const amount = this.toDecimal(dto.amount);
    const postedAtDateKey = this.requireDateKey(
      dto.postedAtDate ?? '',
      'postedAtDate',
    );

    if (postedAtDateKey.slice(0, 7) !== monthKey) {
      throw new BadRequestException(
        'postedAtDate must stay inside the selected occurrence month.',
      );
    }

    const postedAt = this.occurrenceDateKeyToUtcNoon(postedAtDateKey);
    const description = this.requireText(
      dto.description ?? '',
      'Description is required.',
    );
    const notes = this.optionalText(dto.notes);

    if (rule.kind === TransactionKind.TRANSFER) {
      const sourceAccountId = dto.sourceAccountId?.trim();
      const destinationAccountId = dto.destinationAccountId?.trim();

      if (!sourceAccountId || !destinationAccountId) {
        throw new BadRequestException(
          'Transfers require sourceAccountId and destinationAccountId.',
        );
      }

      if (sourceAccountId === destinationAccountId) {
        throw new BadRequestException(
          'Transfers require two different accounts.',
        );
      }

      const sourceAccount = await this.accountsService.getAssignableAccount(
        ownerId,
        sourceAccountId,
      );
      const destinationAccount =
        await this.accountsService.getAssignableAccount(
          ownerId,
          destinationAccountId,
        );

      if (sourceAccount.currency !== destinationAccount.currency) {
        throw new BadRequestException(
          'Transfers require source and destination accounts with the same currency.',
        );
      }

      this.assertOccurrenceDateAllowedForAccount(
        sourceAccount,
        postedAtDateKey,
      );
      this.assertOccurrenceDateAllowedForAccount(
        destinationAccount,
        postedAtDateKey,
      );

      return {
        status: 'OVERRIDDEN',
        overrideAmount: amount,
        overridePostedAtDate: this.dateKeyToValue(postedAtDateKey),
        overrideAccountId: null,
        overrideDirection: null,
        overrideCategoryId: null,
        overrideCounterparty: null,
        overrideSourceAccountId: sourceAccount.id,
        overrideDestinationAccountId: destinationAccount.id,
        overrideDescription: description,
        overrideNotes: notes,
        spec: {
          kind: 'TRANSFER',
          postedAt,
          amount,
          sourceAccountId: sourceAccount.id,
          destinationAccountId: destinationAccount.id,
          currency: sourceAccount.currency,
          description,
          notes,
        },
      };
    }

    const accountId = dto.accountId?.trim();
    if (!accountId) {
      throw new BadRequestException('accountId is required.');
    }

    const direction = dto.direction;
    if (!direction) {
      throw new BadRequestException('direction is required.');
    }

    if (
      rule.kind === TransactionKind.EXPENSE &&
      direction !== TransactionDirection.OUTFLOW
    ) {
      throw new BadRequestException(
        'Expense recurring overrides must use the OUTFLOW direction.',
      );
    }

    if (
      rule.kind === TransactionKind.INCOME &&
      direction !== TransactionDirection.INFLOW
    ) {
      throw new BadRequestException(
        'Income recurring overrides must use the INFLOW direction.',
      );
    }

    const account = await this.accountsService.getAssignableAccount(
      ownerId,
      accountId,
    );
    this.assertOccurrenceDateAllowedForAccount(account, postedAtDateKey);

    if (rule.kind === TransactionKind.ADJUSTMENT && dto.categoryId) {
      throw new BadRequestException(
        'Adjustment recurring overrides cannot be assigned to categories.',
      );
    }

    let category: Category | null = null;
    if (dto.categoryId) {
      category = await this.categoriesService.getAssignableCategory(
        ownerId,
        dto.categoryId,
        rule.kind,
      );
    }

    const counterparty = this.optionalText(dto.counterparty);

    return {
      status: 'OVERRIDDEN',
      overrideAmount: amount,
      overridePostedAtDate: this.dateKeyToValue(postedAtDateKey),
      overrideAccountId: account.id,
      overrideDirection: direction,
      overrideCategoryId: category?.id ?? null,
      overrideCounterparty: counterparty,
      overrideSourceAccountId: null,
      overrideDestinationAccountId: null,
      overrideDescription: description,
      overrideNotes: notes,
      spec: {
        kind: 'STANDARD',
        postedAt,
        amount,
        accountId: account.id,
        currency: account.currency,
        direction,
        categoryId: category?.id ?? null,
        description,
        notes,
        counterparty,
      },
    };
  }

  private async prepareStoredOccurrenceOverride(
    ownerId: string,
    rule: RecurringTransactionRule,
    monthKey: string,
    occurrence: RecurringTransactionOccurrence,
  ): Promise<OverriddenOccurrenceInput> {
    return this.prepareOccurrenceInput(ownerId, rule, monthKey, {
      status: 'OVERRIDDEN',
      amount: occurrence.overrideAmount?.toNumber(),
      postedAtDate: occurrence.overridePostedAtDate?.toISOString().slice(0, 10),
      accountId: occurrence.overrideAccountId ?? undefined,
      direction: occurrence.overrideDirection ?? undefined,
      categoryId: occurrence.overrideCategoryId ?? undefined,
      counterparty: occurrence.overrideCounterparty ?? undefined,
      sourceAccountId: occurrence.overrideSourceAccountId ?? undefined,
      destinationAccountId:
        occurrence.overrideDestinationAccountId ?? undefined,
      description: occurrence.overrideDescription ?? undefined,
      notes: occurrence.overrideNotes ?? undefined,
    }) as Promise<OverriddenOccurrenceInput>;
  }

  private buildDefaultOccurrenceSpec(
    rule: RecurringTransactionRule,
    targets: PreparedRuleTargets,
    monthKey: string,
  ): MaterializedOccurrenceSpec {
    const occurrenceDateKey = this.getOccurrenceDateKey(
      monthKey,
      rule.dayOfMonth,
    );
    const postedAt = this.occurrenceDateKeyToUtcNoon(occurrenceDateKey);

    if (targets.kind === 'TRANSFER') {
      return {
        kind: 'TRANSFER',
        postedAt,
        amount: rule.amount,
        sourceAccountId: targets.sourceAccount.id,
        destinationAccountId: targets.destinationAccount.id,
        currency: targets.sourceAccount.currency,
        description: rule.description,
        notes: rule.notes,
      };
    }

    return {
      kind: 'STANDARD',
      postedAt,
      amount: rule.amount,
      accountId: targets.account.id,
      currency: targets.account.currency,
      direction: rule.direction ?? TransactionDirection.OUTFLOW,
      categoryId: targets.category?.id ?? null,
      description: rule.description,
      notes: rule.notes,
      counterparty: rule.counterparty,
    };
  }

  private async replaceOccurrenceTransactions(
    client: TransactionWriteClient,
    ownerId: string,
    rule: RecurringTransactionRule,
    monthKey: string,
    spec: MaterializedOccurrenceSpec | null,
  ): Promise<void> {
    await this.deleteOccurrenceTransactions(client, ownerId, rule.id, monthKey);

    if (!spec) {
      return;
    }

    const occurrenceMonth = this.monthKeyToValue(monthKey);

    if (spec.kind === 'TRANSFER') {
      await client.transaction.create({
        data: {
          userId: ownerId,
          postedAt: spec.postedAt,
          accountId: spec.sourceAccountId,
          categoryId: null,
          amount: spec.amount,
          currency: spec.currency,
          direction: TransactionDirection.OUTFLOW,
          kind: TransactionKind.TRANSFER,
          description: spec.description,
          notes: spec.notes,
          counterparty: null,
          transferGroupId: this.transferGroupId(rule.id, monthKey),
          recurringRuleId: rule.id,
          recurringOccurrenceMonth: occurrenceMonth,
        },
      });

      await client.transaction.create({
        data: {
          userId: ownerId,
          postedAt: spec.postedAt,
          accountId: spec.destinationAccountId,
          categoryId: null,
          amount: spec.amount,
          currency: spec.currency,
          direction: TransactionDirection.INFLOW,
          kind: TransactionKind.TRANSFER,
          description: spec.description,
          notes: spec.notes,
          counterparty: null,
          transferGroupId: this.transferGroupId(rule.id, monthKey),
          recurringRuleId: rule.id,
          recurringOccurrenceMonth: occurrenceMonth,
        },
      });
      return;
    }

    await client.transaction.create({
      data: {
        userId: ownerId,
        postedAt: spec.postedAt,
        accountId: spec.accountId,
        categoryId: spec.categoryId,
        amount: spec.amount,
        currency: spec.currency,
        direction: spec.direction,
        kind: rule.kind,
        description: spec.description,
        notes: spec.notes,
        counterparty: spec.counterparty,
        transferGroupId: null,
        recurringRuleId: rule.id,
        recurringOccurrenceMonth: occurrenceMonth,
      },
    });
  }

  private async deleteOccurrenceTransactions(
    client: TransactionWriteClient,
    ownerId: string,
    ruleId: string,
    monthKey: string,
  ): Promise<void> {
    await client.transaction.deleteMany({
      where: {
        userId: ownerId,
        recurringRuleId: ruleId,
        recurringOccurrenceMonth: this.monthKeyToValue(monthKey),
      },
    });
  }

  private countNewRows(
    existing: ExistingOccurrenceMapEntry,
    spec: MaterializedOccurrenceSpec,
  ): number {
    if (spec.kind === 'TRANSFER') {
      return Number(!existing.OUTFLOW) + Number(!existing.INFLOW);
    }

    return Number(!existing[spec.direction]);
  }

  private hasMismatchedExistingRows(
    existing: ExistingOccurrenceMapEntry,
    spec: MaterializedOccurrenceSpec,
  ): boolean {
    if (spec.kind === 'TRANSFER') {
      return false;
    }

    return spec.direction === TransactionDirection.INFLOW
      ? existing.OUTFLOW
      : existing.INFLOW;
  }

  private buildExistingOccurrenceEntry(
    rows: Array<{ direction: TransactionDirection }>,
  ): ExistingOccurrenceMapEntry {
    const entry: ExistingOccurrenceMapEntry = {
      INFLOW: false,
      OUTFLOW: false,
    };

    for (const row of rows) {
      entry[row.direction] = true;
    }

    return entry;
  }

  private assertOccurrenceMonthAllowed(
    rule: RecurringTransactionRule,
    monthKey: string,
  ): void {
    if (this.isOccurrenceMonthApplicable(rule, monthKey)) {
      return;
    }

    throw new BadRequestException(
      'This recurring rule does not apply to the selected month.',
    );
  }

  private isOccurrenceMonthApplicable(
    rule: RecurringTransactionRule,
    monthKey: string,
  ): boolean {
    const startDateKey = this.dateKeyFromValue(rule.startDate);
    const endDateKey = rule.endDate
      ? this.dateKeyFromValue(rule.endDate)
      : null;
    const occurrenceDateKey = this.getOccurrenceDateKey(
      monthKey,
      rule.dayOfMonth,
    );

    return (
      occurrenceDateKey >= startDateKey &&
      (!endDateKey || occurrenceDateKey <= endDateKey)
    );
  }

  private assertOccurrenceDateAllowedForAccount(
    account: Account,
    postedAtDateKey: string,
  ): void {
    if (!account.openingBalanceDate) {
      return;
    }

    const cutoffKey = account.openingBalanceDate.toISOString().slice(0, 10);
    if (postedAtDateKey < cutoffKey) {
      throw new BadRequestException(
        `Recurring occurrences for ${account.name} cannot be dated before ${cutoffKey}.`,
      );
    }
  }

  private resolveOptionalMonthRange(
    from?: string,
    to?: string,
  ): { from?: string; to?: string } {
    const fromKey = from ? this.requireMonthKey(from, 'from') : undefined;
    const toKey = to ? this.requireMonthKey(to, 'to') : undefined;

    if (fromKey && toKey && fromKey > toKey) {
      throw new BadRequestException('from must be on or before to.');
    }

    return {
      from: fromKey,
      to: toKey,
    };
  }

  private async prepareRuleInput(
    ownerId: string,
    dto: CreateRecurringTransactionRuleDto | UpdateRecurringTransactionRuleDto,
  ): Promise<PreparedRecurringRuleInput> {
    const name = this.requireText(dto.name, 'Name is required.');
    const description = this.requireText(
      dto.description,
      'Description is required.',
    );
    const startDateKey = this.requireDateKey(dto.startDate, 'startDate');
    const endDateKey = dto.endDate
      ? this.requireDateKey(dto.endDate, 'endDate')
      : null;

    if (endDateKey && endDateKey < startDateKey) {
      throw new BadRequestException('endDate must be on or after startDate.');
    }

    this.assertBackfillWindowAllowed(startDateKey);

    const targets = await this.resolveRuleTargets(ownerId, {
      ...dto,
      description,
      notes: this.optionalText(dto.notes),
      counterparty: this.optionalText(dto.counterparty),
      startDate: this.dateKeyToValue(startDateKey),
      endDate: endDateKey ? this.dateKeyToValue(endDateKey) : null,
    });

    return {
      userId: ownerId,
      name,
      isActive: dto.isActive ?? true,
      kind: dto.kind,
      amount: this.toDecimal(dto.amount),
      dayOfMonth: dto.dayOfMonth,
      startDate: this.dateKeyToValue(startDateKey),
      endDate: endDateKey ? this.dateKeyToValue(endDateKey) : null,
      accountId: targets.kind === 'STANDARD' ? targets.account.id : null,
      direction:
        dto.kind === TransactionKind.TRANSFER ? null : (dto.direction ?? null),
      categoryId:
        targets.kind === 'STANDARD' ? (targets.category?.id ?? null) : null,
      counterparty:
        dto.kind === TransactionKind.TRANSFER
          ? null
          : this.optionalText(dto.counterparty),
      sourceAccountId:
        targets.kind === 'TRANSFER' ? targets.sourceAccount.id : null,
      destinationAccountId:
        targets.kind === 'TRANSFER' ? targets.destinationAccount.id : null,
      description,
      notes: this.optionalText(dto.notes),
    };
  }

  private async resolveRuleTargets(
    ownerId: string,
    dto: {
      kind: TransactionKind;
      accountId?: string | null;
      direction?: TransactionDirection | null;
      categoryId?: string | null;
      counterparty?: string | null;
      sourceAccountId?: string | null;
      destinationAccountId?: string | null;
      description: string;
      notes?: string | null;
      dayOfMonth: number;
      startDate: Date;
      endDate: Date | null;
    },
  ): Promise<PreparedRuleTargets> {
    const startDateKey = this.dateKeyFromValue(dto.startDate);

    if (dto.kind === TransactionKind.TRANSFER) {
      if (!dto.sourceAccountId || !dto.destinationAccountId) {
        throw new BadRequestException(
          'Transfers require sourceAccountId and destinationAccountId.',
        );
      }

      if (
        dto.accountId ||
        dto.direction ||
        dto.categoryId ||
        dto.counterparty
      ) {
        throw new BadRequestException(
          'Transfers must omit accountId, direction, categoryId, and counterparty.',
        );
      }

      if (dto.sourceAccountId === dto.destinationAccountId) {
        throw new BadRequestException(
          'Transfers require two different accounts.',
        );
      }

      const sourceAccount = await this.accountsService.getAssignableAccount(
        ownerId,
        dto.sourceAccountId,
      );
      const destinationAccount =
        await this.accountsService.getAssignableAccount(
          ownerId,
          dto.destinationAccountId,
        );

      if (sourceAccount.currency !== destinationAccount.currency) {
        throw new BadRequestException(
          'Transfers require source and destination accounts with the same currency.',
        );
      }

      this.assertRuleStartAllowedForAccount(
        sourceAccount,
        startDateKey,
        dto.dayOfMonth,
      );
      this.assertRuleStartAllowedForAccount(
        destinationAccount,
        startDateKey,
        dto.dayOfMonth,
      );

      return {
        kind: 'TRANSFER',
        sourceAccount,
        destinationAccount,
      };
    }

    if (!dto.accountId) {
      throw new BadRequestException('accountId is required.');
    }

    if (!dto.direction) {
      throw new BadRequestException('direction is required.');
    }

    if (
      dto.kind === TransactionKind.EXPENSE &&
      dto.direction !== TransactionDirection.OUTFLOW
    ) {
      throw new BadRequestException(
        'Expense recurring rules must use the OUTFLOW direction.',
      );
    }

    if (
      dto.kind === TransactionKind.INCOME &&
      dto.direction !== TransactionDirection.INFLOW
    ) {
      throw new BadRequestException(
        'Income recurring rules must use the INFLOW direction.',
      );
    }

    if (dto.kind === TransactionKind.ADJUSTMENT && dto.categoryId) {
      throw new BadRequestException(
        'Adjustment recurring rules cannot be assigned to categories.',
      );
    }

    const account = await this.accountsService.getAssignableAccount(
      ownerId,
      dto.accountId,
    );
    this.assertRuleStartAllowedForAccount(
      account,
      startDateKey,
      dto.dayOfMonth,
    );

    let category: Category | null = null;
    if (dto.categoryId) {
      category = await this.categoriesService.getAssignableCategory(
        ownerId,
        dto.categoryId,
        dto.kind,
      );
    }

    return {
      kind: 'STANDARD',
      account,
      category,
    };
  }

  private assertRuleStartAllowedForAccount(
    account: Account,
    startDateKey: string,
    dayOfMonth: number,
  ): void {
    if (!account.openingBalanceDate) {
      return;
    }

    const firstOccurrenceKey = this.getFirstOccurrenceDateKey(
      startDateKey,
      dayOfMonth,
    );
    const cutoffKey = account.openingBalanceDate.toISOString().slice(0, 10);

    if (firstOccurrenceKey < cutoffKey) {
      throw new BadRequestException(
        `Recurring rules for ${account.name} cannot create occurrences before ${cutoffKey}.`,
      );
    }
  }

  private listApplicableMonthKeys(
    rule: RecurringTransactionRule,
    currentMonthKey: string,
  ): string[] {
    const months: string[] = [];
    const startDateKey = this.dateKeyFromValue(rule.startDate);
    const endDateKey = rule.endDate
      ? this.dateKeyFromValue(rule.endDate)
      : null;
    let monthKey = this.monthKeyFromDateKey(startDateKey);

    while (monthKey <= currentMonthKey) {
      const occurrenceDateKey = this.getOccurrenceDateKey(
        monthKey,
        rule.dayOfMonth,
      );

      if (
        occurrenceDateKey >= startDateKey &&
        (!endDateKey || occurrenceDateKey <= endDateKey)
      ) {
        months.push(monthKey);
      }

      monthKey = this.incrementMonthKey(monthKey);
    }

    return months;
  }

  private async clearMaterializationError(ruleId: string): Promise<void> {
    await this.prisma.recurringTransactionRule.update({
      where: { id: ruleId },
      data: {
        lastMaterializationError: null,
        lastMaterializationErrorAt: null,
      },
    });
  }

  private async persistMaterializationError(ruleId: string): Promise<void> {
    await this.prisma.recurringTransactionRule.update({
      where: { id: ruleId },
      data: {
        lastMaterializationError: USER_VISIBLE_MATERIALIZATION_ERROR,
        lastMaterializationErrorAt: new Date(),
      },
    });
  }

  private assertBackfillWindowAllowed(startDateKey: string): void {
    const earliestAllowedMonthKey = this.addMonthsToMonthKey(
      this.formatMonthKey(new Date()),
      -(MAX_RECURRING_BACKFILL_MONTHS - 1),
    );
    const startMonthKey = this.monthKeyFromDateKey(startDateKey);

    if (startMonthKey < earliestAllowedMonthKey) {
      throw new BadRequestException(
        `startDate cannot be more than ${MAX_RECURRING_BACKFILL_MONTHS} months in the past.`,
      );
    }
  }

  private async findLatestSnapshotOnOrBefore(
    ownerId: string,
    dateKey: string,
  ): Promise<NetWorthSnapshot | null> {
    return this.prisma.netWorthSnapshot.findFirst({
      where: {
        userId: ownerId,
        snapshotDate: {
          lte: this.dateKeyToValue(dateKey),
        },
      },
      orderBy: [{ snapshotDate: 'desc' }, { createdAt: 'desc' }],
    });
  }

  private resolveMonthRange(month: string): {
    from: string;
    to: string;
    openingSnapshotCutoff: string;
    closingSnapshotCutoff: string;
  } {
    const [yearValue, monthValue] = month.split('-').map(Number);

    if (!yearValue || !monthValue || monthValue < 1 || monthValue > 12) {
      throw new BadRequestException('month must use the YYYY-MM format.');
    }

    const lastDay = this.daysInMonth(yearValue, monthValue);
    const previousMonthDate = new Date(Date.UTC(yearValue, monthValue - 1, 0));

    return {
      from: `${month}-01`,
      to: `${month}-${String(lastDay).padStart(2, '0')}`,
      openingSnapshotCutoff: `${previousMonthDate.getUTCFullYear()}-${String(
        previousMonthDate.getUTCMonth() + 1,
      ).padStart(2, '0')}-${String(previousMonthDate.getUTCDate()).padStart(
        2,
        '0',
      )}`,
      closingSnapshotCutoff: `${month}-${String(lastDay).padStart(2, '0')}`,
    };
  }

  private occurrenceDateKeyToUtcNoon(dateKey: string): Date {
    const [year, month, day] = dateKey.split('-').map(Number);
    return romeDateTimeToUtc(year, month, day, 12, 0, 0, 0);
  }

  private getFirstOccurrenceDateKey(
    startDateKey: string,
    dayOfMonth: number,
  ): string {
    let monthKey = this.monthKeyFromDateKey(startDateKey);

    while (true) {
      const occurrenceDateKey = this.getOccurrenceDateKey(monthKey, dayOfMonth);
      if (occurrenceDateKey >= startDateKey) {
        return occurrenceDateKey;
      }

      monthKey = this.incrementMonthKey(monthKey);
    }
  }

  private getOccurrenceDateKey(monthKey: string, dayOfMonth: number): string {
    const [yearValue, monthValue] = monthKey.split('-').map(Number);
    const day = Math.min(dayOfMonth, this.daysInMonth(yearValue, monthValue));

    return `${monthKey}-${String(day).padStart(2, '0')}`;
  }

  private formatMonthKey(value: Date): string {
    return MONTH_KEY_FORMATTER.format(value);
  }

  private monthValueToKey(value: Date): string {
    return value.toISOString().slice(0, 7);
  }

  private monthKeyToValue(monthKey: string): Date {
    return new Date(`${monthKey}-01T00:00:00.000Z`);
  }

  private monthKeyFromDateKey(dateKey: string): string {
    return dateKey.slice(0, 7);
  }

  private incrementMonthKey(monthKey: string): string {
    return this.addMonthsToMonthKey(monthKey, 1);
  }

  private addMonthsToMonthKey(monthKey: string, amount: number): string {
    const [yearValue, monthValue] = monthKey.split('-').map(Number);
    const next = new Date(Date.UTC(yearValue, monthValue - 1 + amount, 1));

    return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(
      2,
      '0',
    )}`;
  }

  private ruleOccurrenceKey(ruleId: string, monthKey: string): string {
    return `${ruleId}:${monthKey}`;
  }

  private transferGroupId(ruleId: string, monthKey: string): string {
    return `recurring_${ruleId}_${monthKey}`;
  }

  private requireText(value: string, message: string): string {
    const normalized = value.trim();

    if (!normalized) {
      throw new BadRequestException(message);
    }

    return normalized;
  }

  private optionalText(value?: string | null): string | null {
    const normalized = value?.trim() ?? '';
    return normalized ? normalized : null;
  }

  private requireDateKey(value: string, fieldName: string): string {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      throw new BadRequestException(`${fieldName} must use YYYY-MM-DD.`);
    }

    const parsed = new Date(`${value}T00:00:00.000Z`);
    if (
      Number.isNaN(parsed.getTime()) ||
      parsed.toISOString().slice(0, 10) !== value
    ) {
      throw new BadRequestException(`${fieldName} is invalid.`);
    }

    return value;
  }

  private requireMonthKey(value: string, fieldName: string): string {
    if (!/^\d{4}-\d{2}$/.test(value)) {
      throw new BadRequestException(`${fieldName} must use YYYY-MM.`);
    }

    const [yearValue, monthValue] = value.split('-').map(Number);
    if (!yearValue || monthValue < 1 || monthValue > 12) {
      throw new BadRequestException(`${fieldName} is invalid.`);
    }

    return value;
  }

  private dateKeyToValue(dateKey: string): Date {
    return new Date(`${dateKey}T00:00:00.000Z`);
  }

  private dateKeyFromValue(value: Date): string {
    return DATE_KEY_FORMATTER.format(value);
  }

  private daysInMonth(yearValue: number, monthValue: number): number {
    return new Date(Date.UTC(yearValue, monthValue, 0)).getUTCDate();
  }

  private toDecimal(value: number): Prisma.Decimal {
    const decimal = new Prisma.Decimal(value);

    if (decimal.lte(ZERO)) {
      throw new BadRequestException('amount must be greater than zero.');
    }

    return decimal;
  }
}
