import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AccountsService } from '@accounts/accounts.service';
import { PrismaService } from '@prisma/prisma.service';
import { CategoriesService } from '@transactions/categories.service';
import { TransactionsService } from '@transactions/transactions.service';
import { romeDateTimeToUtc } from '@transactions/transactions.dates';
import {
  Account,
  Category,
  NetWorthSnapshot,
  Prisma,
  RecurringTransactionRule,
  TransactionDirection,
  TransactionKind,
} from '@prisma/client';
import type {
  MaterializeRecurringRulesResponse,
  MonthlyReviewResponse,
} from '@finhance/shared';
import { toMonthlyReviewResponse } from '@recurring/recurring.mapper';
import { CreateRecurringTransactionRuleDto } from '@recurring/dto/create-recurring-transaction-rule.dto';
import { UpdateRecurringTransactionRuleDto } from '@recurring/dto/update-recurring-transaction-rule.dto';

const ROME_TIME_ZONE = 'Europe/Rome';
const ZERO = new Prisma.Decimal(0);
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

@Injectable()
export class RecurringService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accountsService: AccountsService,
    private readonly categoriesService: CategoriesService,
    private readonly transactionsService: TransactionsService,
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

  async materialize(
    ownerId: string,
  ): Promise<MaterializeRecurringRulesResponse> {
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
    const existingRows = await this.prisma.transaction.findMany({
      where: {
        userId: ownerId,
        recurringRuleId: {
          in: rules.map((rule) => rule.id),
        },
      },
      select: {
        recurringRuleId: true,
        recurringOccurrenceMonth: true,
        direction: true,
      },
    });

    const existingByRuleAndMonth = new Map<
      string,
      ExistingOccurrenceMapEntry
    >();

    for (const row of existingRows) {
      if (!row.recurringRuleId || !row.recurringOccurrenceMonth) {
        continue;
      }

      const key = this.ruleOccurrenceKey(
        row.recurringRuleId,
        this.monthValueToKey(row.recurringOccurrenceMonth),
      );
      const entry = existingByRuleAndMonth.get(key) ?? {
        INFLOW: false,
        OUTFLOW: false,
      };

      entry[row.direction] = true;
      existingByRuleAndMonth.set(key, entry);
    }

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
          const occurrenceDateKey = this.getOccurrenceDateKey(
            monthKey,
            rule.dayOfMonth,
          );
          const occurrenceMonth = this.monthKeyToValue(monthKey);
          const postedAt = this.occurrenceDateKeyToUtcNoon(occurrenceDateKey);
          const existing = existingByRuleAndMonth.get(
            this.ruleOccurrenceKey(rule.id, monthKey),
          ) ?? {
            INFLOW: false,
            OUTFLOW: false,
          };

          if (targets.kind === 'TRANSFER') {
            if (!existing.OUTFLOW) {
              await this.prisma.transaction.create({
                data: {
                  userId: ownerId,
                  postedAt,
                  accountId: targets.sourceAccount.id,
                  categoryId: null,
                  amount: rule.amount,
                  currency: targets.sourceAccount.currency,
                  direction: TransactionDirection.OUTFLOW,
                  kind: TransactionKind.TRANSFER,
                  description: rule.description,
                  notes: rule.notes,
                  counterparty: null,
                  transferGroupId: this.transferGroupId(rule.id, monthKey),
                  recurringRuleId: rule.id,
                  recurringOccurrenceMonth: occurrenceMonth,
                },
              });
              existing.OUTFLOW = true;
              createdForRule += 1;
            }

            if (!existing.INFLOW) {
              await this.prisma.transaction.create({
                data: {
                  userId: ownerId,
                  postedAt,
                  accountId: targets.destinationAccount.id,
                  categoryId: null,
                  amount: rule.amount,
                  currency: targets.destinationAccount.currency,
                  direction: TransactionDirection.INFLOW,
                  kind: TransactionKind.TRANSFER,
                  description: rule.description,
                  notes: rule.notes,
                  counterparty: null,
                  transferGroupId: this.transferGroupId(rule.id, monthKey),
                  recurringRuleId: rule.id,
                  recurringOccurrenceMonth: occurrenceMonth,
                },
              });
              existing.INFLOW = true;
              createdForRule += 1;
            }

            existingByRuleAndMonth.set(
              this.ruleOccurrenceKey(rule.id, monthKey),
              existing,
            );
            continue;
          }

          if (existing[rule.direction ?? TransactionDirection.OUTFLOW]) {
            continue;
          }

          await this.prisma.transaction.create({
            data: {
              userId: ownerId,
              postedAt,
              accountId: targets.account.id,
              categoryId: targets.category?.id ?? null,
              amount: rule.amount,
              currency: targets.account.currency,
              direction: rule.direction ?? TransactionDirection.OUTFLOW,
              kind: rule.kind,
              description: rule.description,
              notes: rule.notes,
              counterparty: rule.counterparty,
              transferGroupId: null,
              recurringRuleId: rule.id,
              recurringOccurrenceMonth: occurrenceMonth,
            },
          });

          existing[rule.direction ?? TransactionDirection.OUTFLOW] = true;
          existingByRuleAndMonth.set(
            this.ruleOccurrenceKey(rule.id, monthKey),
            existing,
          );
          createdForRule += 1;
        }

        createdCount += createdForRule;
        await this.clearMaterializationError(rule.id);
      } catch (error) {
        failedRuleCount += 1;
        await this.persistMaterializationError(
          rule.id,
          error instanceof Error
            ? error.message
            : 'Unable to materialize this recurring rule.',
        );
      }
    }

    return {
      createdCount,
      processedRuleCount: rules.length,
      failedRuleCount,
    };
  }

  async getMonthlyReview(
    ownerId: string,
    month: string,
  ): Promise<MonthlyReviewResponse> {
    const range = this.resolveMonthRange(month);
    const [cashflow, openingSnapshot, closingSnapshot, reconciliations] =
      await Promise.all([
        this.transactionsService.getCashflowSummary(ownerId, {
          from: range.from,
          to: range.to,
          includeArchivedAccounts: true,
        }),
        this.findLatestSnapshotOnOrBefore(ownerId, range.openingSnapshotCutoff),
        this.findLatestSnapshotOnOrBefore(ownerId, range.closingSnapshotCutoff),
        this.accountsService.findReconciliation(ownerId),
      ]);

    return toMonthlyReviewResponse({
      month,
      cashflow,
      openingSnapshot,
      closingSnapshot,
      reconciliationHighlights: reconciliations.filter(
        (reconciliation) => reconciliation.status !== 'CLEAN',
      ),
    });
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

  private async persistMaterializationError(
    ruleId: string,
    message: string,
  ): Promise<void> {
    await this.prisma.recurringTransactionRule.update({
      where: { id: ruleId },
      data: {
        lastMaterializationError: message,
        lastMaterializationErrorAt: new Date(),
      },
    });
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
    const [yearValue, monthValue] = monthKey.split('-').map(Number);
    const next = new Date(Date.UTC(yearValue, monthValue, 1));

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
    if (Number.isNaN(parsed.getTime())) {
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
