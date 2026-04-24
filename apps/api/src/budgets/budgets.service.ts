import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '@prisma/prisma.service';
import { CategoryType, Prisma, TransactionKind } from '@prisma/client';
import type {
  CategoryBudgetOverrideResponse,
  CategoryBudgetResponse,
  MonthlyBudgetCurrencySummaryResponse,
  MonthlyBudgetItemResponse,
  MonthlyBudgetResponse,
  MonthlyBudgetUnbudgetedCategoryResponse,
} from '@finhance/shared';
import { CategoriesService } from '@transactions/categories.service';
import {
  addMonthsToRomeMonth,
  diffRomeMonths,
  romeMonthToUtcExclusiveEnd,
  romeMonthToUtcStart,
  utcDateToRomeMonth,
} from '@transactions/transactions.dates';
import {
  toCategoryBudgetOverrideResponse,
  toCategoryBudgetResponse,
} from '@budgets/budgets.mapper';
import { CreateCategoryBudgetDto } from '@budgets/dto/create-category-budget.dto';
import { UpdateCategoryBudgetDto } from '@budgets/dto/update-category-budget.dto';
import { UpsertCategoryBudgetOverrideDto } from '@budgets/dto/upsert-category-budget-override.dto';

const LOCAL_MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;
const MAX_OVERRIDE_RANGE_MONTHS = 24;
const OVER_BUDGET_HIGHLIGHT_LIMIT = 3;

type CategoryBudgetModel = Prisma.CategoryBudgetGetPayload<{
  include: {
    category: true;
    overrides: true;
  };
}>;

type ExpenseTransactionRow = Prisma.TransactionGetPayload<{
  include: {
    category: true;
  };
}>;

type BudgetTransactionClient = PrismaService | Prisma.TransactionClient;

interface HistoricalCategoryContext {
  previousMonthExpense: number | null;
  averageExpenseLast3Months: number | null;
}

interface MonthlyBudgetQueryOptions {
  includeArchivedCategories?: boolean;
}

@Injectable()
export class BudgetsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly categoriesService: CategoriesService,
  ) {}

  async findMonthly(
    ownerId: string,
    month: string,
    options?: MonthlyBudgetQueryOptions,
  ): Promise<MonthlyBudgetResponse> {
    const monthKey = this.requireMonthKey(month, 'month');
    const includeArchivedCategories =
      options?.includeArchivedCategories ?? false;
    const monthValue = this.monthKeyToValue(monthKey);

    const [activeBudgets, expenseRows] = await Promise.all([
      this.prisma.categoryBudget.findMany({
        where: {
          userId: ownerId,
          startMonth: {
            lte: monthValue,
          },
          OR: [{ endMonth: null }, { endMonth: { gte: monthValue } }],
          ...(includeArchivedCategories
            ? {}
            : {
                category: {
                  archivedAt: null,
                },
              }),
        },
        include: {
          category: true,
          overrides: {
            where: {
              month: monthValue,
            },
          },
        },
      }),
      this.findExpenseRows(
        ownerId,
        addMonthsToRomeMonth(monthKey, -3),
        monthKey,
        {
          includeArchivedCategories,
        },
      ),
    ]);

    const previousMonthKey = addMonthsToRomeMonth(monthKey, -1);
    const historicalContext = this.buildHistoricalContextMap(
      expenseRows,
      monthKey,
      previousMonthKey,
    );
    const currentRows = expenseRows.filter(
      (row) => utcDateToRomeMonth(row.postedAt) === monthKey,
    );

    const spendByKey = new Map<string, number>();
    const uncategorizedByCurrency = new Map<string, number>();

    for (const row of currentRows) {
      if (!row.categoryId) {
        uncategorizedByCurrency.set(
          row.currency,
          (uncategorizedByCurrency.get(row.currency) ?? 0) +
            row.amount.toNumber(),
        );
        continue;
      }

      const key = this.categoryCurrencyKey(row.categoryId, row.currency);
      spendByKey.set(key, (spendByKey.get(key) ?? 0) + row.amount.toNumber());
    }

    const budgetRowsByKey = new Map<string, CategoryBudgetModel>();
    for (const budget of activeBudgets) {
      const key = this.categoryCurrencyKey(budget.categoryId, budget.currency);
      const existing = budgetRowsByKey.get(key);

      if (!existing || existing.startMonth < budget.startMonth) {
        budgetRowsByKey.set(key, budget);
      }
    }

    const itemBuckets = new Map<string, MonthlyBudgetItemResponse[]>();
    const summaryTotals = new Map<
      string,
      Omit<
        MonthlyBudgetCurrencySummaryResponse,
        'items' | 'overBudgetHighlights' | 'unbudgetedCategories'
      >
    >();

    for (const budget of [...budgetRowsByKey.values()].sort((left, right) =>
      this.compareBudgetRows(left, right),
    )) {
      const budgetAmount =
        budget.overrides[0]?.amount.toNumber() ?? budget.amount.toNumber();
      const spentAmount =
        spendByKey.get(
          this.categoryCurrencyKey(budget.categoryId, budget.currency),
        ) ?? 0;
      const item = this.createMonthlyBudgetItem(
        budget,
        budgetAmount,
        spentAmount,
        historicalContext.get(
          this.categoryCurrencyKey(budget.categoryId, budget.currency),
        ) ?? null,
      );
      const bucket = itemBuckets.get(budget.currency) ?? [];
      bucket.push(item);
      itemBuckets.set(budget.currency, bucket);

      const summary =
        summaryTotals.get(budget.currency) ??
        this.createEmptyCurrencyTotals(budget.currency);
      summary.budgetTotal += item.budgetAmount;
      summary.spentTotal += item.spentAmount;
      summary.remainingTotal += item.remainingAmount;
      summary.overBudgetTotal += Math.max(
        0,
        item.spentAmount - item.budgetAmount,
      );
      summary.overBudgetCount += item.status === 'OVER_BUDGET' ? 1 : 0;
      summary.budgetedCategoryCount += 1;
      summaryTotals.set(budget.currency, summary);
    }

    const unbudgetedCategoriesByCurrency = new Map<
      string,
      MonthlyBudgetUnbudgetedCategoryResponse[]
    >();

    for (const row of currentRows) {
      if (!row.categoryId || !row.category) {
        continue;
      }

      const key = this.categoryCurrencyKey(row.categoryId, row.currency);
      if (budgetRowsByKey.has(key)) {
        continue;
      }

      const currencyBucket =
        unbudgetedCategoriesByCurrency.get(row.currency) ?? [];
      const existing = currencyBucket.find(
        (entry) => entry.categoryId === row.categoryId,
      );

      if (existing) {
        existing.spentAmount += row.amount.toNumber();
      } else {
        const context = historicalContext.get(key) ?? null;
        currencyBucket.push({
          categoryId: row.categoryId,
          categoryName: row.category.name,
          categoryArchivedAt: row.category.archivedAt?.toISOString() ?? null,
          currency: row.currency,
          spentAmount: row.amount.toNumber(),
          previousMonthExpense: context?.previousMonthExpense ?? null,
          averageExpenseLast3Months: context?.averageExpenseLast3Months ?? null,
        });
      }

      unbudgetedCategoriesByCurrency.set(row.currency, currencyBucket);
    }

    const currencies = new Set<string>([
      ...itemBuckets.keys(),
      ...uncategorizedByCurrency.keys(),
      ...unbudgetedCategoriesByCurrency.keys(),
    ]);

    return {
      month: monthKey,
      includeArchivedCategories,
      currencies: [...currencies]
        .sort((left, right) => left.localeCompare(right))
        .map((currency) => {
          const items = (itemBuckets.get(currency) ?? []).sort((left, right) =>
            left.categoryName.localeCompare(right.categoryName),
          );
          const overBudgetHighlights = [...items]
            .filter((item) => item.status === 'OVER_BUDGET')
            .sort(
              (left, right) =>
                right.spentAmount -
                right.budgetAmount -
                (left.spentAmount - left.budgetAmount),
            )
            .slice(0, OVER_BUDGET_HIGHLIGHT_LIMIT);
          const unbudgetedCategories = (
            unbudgetedCategoriesByCurrency.get(currency) ?? []
          ).sort((left, right) => right.spentAmount - left.spentAmount);
          const baseSummary =
            summaryTotals.get(currency) ??
            this.createEmptyCurrencyTotals(currency);

          return {
            ...baseSummary,
            unbudgetedExpenseTotal: unbudgetedCategories.reduce(
              (sum, item) => sum + item.spentAmount,
              0,
            ),
            uncategorizedExpenseTotal:
              uncategorizedByCurrency.get(currency) ?? 0,
            items,
            overBudgetHighlights,
            unbudgetedCategories,
          };
        }),
    };
  }

  async create(
    ownerId: string,
    dto: CreateCategoryBudgetDto,
  ): Promise<CategoryBudgetResponse> {
    return this.withSerializableRetry(() =>
      this.prisma.$transaction(
        async (tx) => {
          const category = await this.requireExpenseCategory(
            ownerId,
            dto.categoryId,
            {
              requireActive: true,
            },
          );
          const currency = this.requireCurrency(dto.currency);
          const startMonth = this.requireMonthKey(dto.startMonth, 'startMonth');
          const endMonth = this.optionalMonthKey(dto.endMonth, 'endMonth');

          this.assertMonthRange(startMonth, endMonth, 'startMonth', 'endMonth');
          await this.assertNoOverlappingBudgets(
            {
              ownerId,
              categoryId: category.id,
              currency,
              startMonth,
              endMonth,
            },
            tx,
          );

          const budget = await tx.categoryBudget.create({
            data: {
              userId: ownerId,
              categoryId: category.id,
              currency,
              amount: this.toDecimal(dto.amount),
              startMonth: this.monthKeyToValue(startMonth),
              endMonth: endMonth ? this.monthKeyToValue(endMonth) : null,
            },
            include: {
              category: true,
            },
          });

          return toCategoryBudgetResponse(budget);
        },
        {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        },
      ),
    );
  }

  async update(
    ownerId: string,
    id: string,
    dto: UpdateCategoryBudgetDto,
  ): Promise<CategoryBudgetResponse> {
    return this.withSerializableRetry(() =>
      this.prisma.$transaction(
        async (tx) => {
          const budget = await this.requireBudget(ownerId, id, tx);
          const startMonth = this.toMonthKey(budget.startMonth);
          const currentEndMonth = this.toOptionalMonthKey(budget.endMonth);
          const effectiveMonth = this.requireMonthKey(
            dto.effectiveMonth,
            'effectiveMonth',
          );
          const nextEndMonth =
            dto.endMonth === undefined
              ? currentEndMonth
              : this.optionalMonthKey(dto.endMonth, 'endMonth');

          this.assertMonthWithinBudgetCoverage(
            effectiveMonth,
            startMonth,
            currentEndMonth,
            'effectiveMonth',
          );
          this.assertMonthRange(
            effectiveMonth,
            nextEndMonth,
            'effectiveMonth',
            'endMonth',
          );

          if (effectiveMonth <= startMonth) {
            await this.assertNoOverlappingBudgets(
              {
                ownerId,
                categoryId: budget.categoryId,
                currency: budget.currency,
                startMonth,
                endMonth: nextEndMonth,
                excludeBudgetId: budget.id,
              },
              tx,
            );

            const updated = await tx.categoryBudget.update({
              where: { id: budget.id },
              data: {
                amount: this.toDecimal(dto.amount),
                endMonth: nextEndMonth
                  ? this.monthKeyToValue(nextEndMonth)
                  : null,
              },
              include: {
                category: true,
              },
            });

            return toCategoryBudgetResponse(updated);
          }

          await this.assertNoOverlappingBudgets(
            {
              ownerId,
              categoryId: budget.categoryId,
              currency: budget.currency,
              startMonth: effectiveMonth,
              endMonth: nextEndMonth,
              excludeBudgetId: budget.id,
            },
            tx,
          );

          const previousEndMonth = addMonthsToRomeMonth(effectiveMonth, -1);
          const created = await tx.categoryBudget.create({
            data: {
              userId: ownerId,
              categoryId: budget.categoryId,
              currency: budget.currency,
              amount: this.toDecimal(dto.amount),
              startMonth: this.monthKeyToValue(effectiveMonth),
              endMonth: nextEndMonth
                ? this.monthKeyToValue(nextEndMonth)
                : null,
            },
            include: {
              category: true,
            },
          });

          await tx.categoryBudget.update({
            where: { id: budget.id },
            data: {
              endMonth: this.monthKeyToValue(previousEndMonth),
            },
          });

          await tx.categoryBudgetOverride.updateMany({
            where: {
              userId: ownerId,
              categoryBudgetId: budget.id,
              month: {
                gte: this.monthKeyToValue(effectiveMonth),
              },
            },
            data: {
              categoryBudgetId: created.id,
              userId: ownerId,
            },
          });

          return toCategoryBudgetResponse(created);
        },
        {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        },
      ),
    );
  }

  async remove(
    ownerId: string,
    id: string,
    effectiveMonth: string,
  ): Promise<void> {
    const budget = await this.requireBudget(ownerId, id);
    const startMonth = this.toMonthKey(budget.startMonth);
    const currentEndMonth = this.toOptionalMonthKey(budget.endMonth);
    const normalizedEffectiveMonth = this.requireMonthKey(
      effectiveMonth,
      'effectiveMonth',
    );

    this.assertMonthWithinBudgetCoverage(
      normalizedEffectiveMonth,
      startMonth,
      currentEndMonth,
      'effectiveMonth',
    );

    if (normalizedEffectiveMonth <= startMonth) {
      await this.prisma.categoryBudget.delete({
        where: { id: budget.id },
      });
      return;
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.categoryBudget.update({
        where: { id: budget.id },
        data: {
          endMonth: this.monthKeyToValue(
            addMonthsToRomeMonth(normalizedEffectiveMonth, -1),
          ),
        },
      });

      await tx.categoryBudgetOverride.deleteMany({
        where: {
          userId: ownerId,
          categoryBudgetId: budget.id,
          month: {
            gte: this.monthKeyToValue(normalizedEffectiveMonth),
          },
        },
      });
    });
  }

  async findOverrides(
    ownerId: string,
    budgetId: string,
    filters?: {
      from?: string;
      to?: string;
    },
  ): Promise<CategoryBudgetOverrideResponse[]> {
    const budget = await this.requireBudget(ownerId, budgetId);
    const range = this.resolveOptionalMonthRange(filters?.from, filters?.to);

    const overrides = await this.prisma.categoryBudgetOverride.findMany({
      where: {
        userId: ownerId,
        categoryBudgetId: budget.id,
        ...(range
          ? {
              month: {
                gte: this.monthKeyToValue(range.from),
                lte: this.monthKeyToValue(range.to),
              },
            }
          : {}),
      },
      orderBy: [{ month: 'asc' }, { createdAt: 'asc' }],
    });

    return overrides.map(toCategoryBudgetOverrideResponse);
  }

  async upsertOverride(
    ownerId: string,
    budgetId: string,
    month: string,
    dto: UpsertCategoryBudgetOverrideDto,
  ): Promise<CategoryBudgetOverrideResponse> {
    const budget = await this.requireBudget(ownerId, budgetId);
    const monthKey = this.requireMonthKey(month, 'month');

    this.assertMonthWithinBudgetCoverage(
      monthKey,
      this.toMonthKey(budget.startMonth),
      this.toOptionalMonthKey(budget.endMonth),
      'month',
    );

    const override = await this.prisma.categoryBudgetOverride.upsert({
      where: {
        categoryBudgetId_month: {
          categoryBudgetId: budget.id,
          month: this.monthKeyToValue(monthKey),
        },
      },
      create: {
        userId: ownerId,
        categoryBudgetId: budget.id,
        month: this.monthKeyToValue(monthKey),
        amount: this.toDecimal(dto.amount),
        note: this.optionalText(dto.note),
      },
      update: {
        amount: this.toDecimal(dto.amount),
        note: this.optionalText(dto.note),
      },
    });

    return toCategoryBudgetOverrideResponse(override);
  }

  async clearOverride(
    ownerId: string,
    budgetId: string,
    month: string,
  ): Promise<void> {
    const budget = await this.requireBudget(ownerId, budgetId);
    const monthKey = this.requireMonthKey(month, 'month');

    await this.prisma.categoryBudgetOverride.deleteMany({
      where: {
        userId: ownerId,
        categoryBudgetId: budget.id,
        month: this.monthKeyToValue(monthKey),
      },
    });
  }

  private async requireBudget(
    ownerId: string,
    id: string,
    client: BudgetTransactionClient = this.prisma,
  ): Promise<CategoryBudgetModel> {
    const budget = await client.categoryBudget.findFirst({
      where: {
        id,
        userId: ownerId,
      },
      include: {
        category: true,
        overrides: {
          where: {
            userId: ownerId,
          },
        },
      },
    });

    if (!budget) {
      throw new NotFoundException(`Budget ${id} was not found.`);
    }

    return budget;
  }

  private async requireExpenseCategory(
    ownerId: string,
    categoryId: string,
    options?: { requireActive?: boolean },
  ) {
    const category = await this.categoriesService.findOne(ownerId, categoryId);

    if (category.type !== CategoryType.EXPENSE) {
      throw new BadRequestException(
        'Budgets can only be assigned to expense categories.',
      );
    }

    if (options?.requireActive && category.archivedAt) {
      throw new BadRequestException(
        'Archived categories cannot receive new budgets.',
      );
    }

    return category;
  }

  private async assertNoOverlappingBudgets(
    input: {
      ownerId: string;
      categoryId: string;
      currency: string;
      startMonth: string;
      endMonth: string | null;
      excludeBudgetId?: string;
    },
    client: BudgetTransactionClient = this.prisma,
  ): Promise<void> {
    const overlapping = await client.categoryBudget.findFirst({
      where: {
        userId: input.ownerId,
        categoryId: input.categoryId,
        currency: input.currency,
        ...(input.excludeBudgetId
          ? {
              id: {
                not: input.excludeBudgetId,
              },
            }
          : {}),
        ...(input.endMonth
          ? {
              startMonth: {
                lte: this.monthKeyToValue(input.endMonth),
              },
            }
          : {}),
        OR: [
          {
            endMonth: null,
          },
          {
            endMonth: {
              gte: this.monthKeyToValue(input.startMonth),
            },
          },
        ],
      },
    });

    if (overlapping) {
      throw new BadRequestException(
        'Budget ranges cannot overlap for the same category and currency.',
      );
    }
  }

  private async findExpenseRows(
    ownerId: string,
    fromMonth: string,
    toMonth: string,
    options?: { includeArchivedCategories?: boolean },
  ): Promise<ExpenseTransactionRow[]> {
    const includeArchivedCategories =
      options?.includeArchivedCategories ?? false;

    return this.prisma.transaction.findMany({
      where: {
        userId: ownerId,
        kind: TransactionKind.EXPENSE,
        postedAt: {
          gte: romeMonthToUtcStart(fromMonth),
          lt: romeMonthToUtcExclusiveEnd(toMonth),
        },
        ...(includeArchivedCategories
          ? {}
          : {
              OR: [{ categoryId: null }, { category: { archivedAt: null } }],
            }),
      },
      include: {
        category: true,
      },
    });
  }

  private buildHistoricalContextMap(
    rows: ExpenseTransactionRow[],
    currentMonth: string,
    previousMonth: string,
  ): Map<string, HistoricalCategoryContext> {
    const totals = new Map<string, Map<string, number>>();
    const averageMonths = [
      addMonthsToRomeMonth(currentMonth, -3),
      addMonthsToRomeMonth(currentMonth, -2),
      addMonthsToRomeMonth(currentMonth, -1),
    ];

    for (const row of rows) {
      if (!row.categoryId) {
        continue;
      }

      const key = this.categoryCurrencyKey(row.categoryId, row.currency);
      const monthKey = utcDateToRomeMonth(row.postedAt);
      const existing = totals.get(key) ?? new Map<string, number>();
      existing.set(
        monthKey,
        (existing.get(monthKey) ?? 0) + row.amount.toNumber(),
      );
      totals.set(key, existing);
    }

    return new Map(
      [...totals.entries()].map(([key, byMonth]) => {
        const previousMonthExpense = byMonth.has(previousMonth)
          ? (byMonth.get(previousMonth) ?? 0)
          : null;
        const lastThreeTotals = averageMonths.map(
          (monthKey) => byMonth.get(monthKey) ?? 0,
        );
        const hasAnyHistory = lastThreeTotals.some((total) => total > 0);

        return [
          key,
          {
            previousMonthExpense,
            averageExpenseLast3Months: hasAnyHistory
              ? lastThreeTotals.reduce((sum, total) => sum + total, 0) /
                lastThreeTotals.length
              : null,
          } satisfies HistoricalCategoryContext,
        ];
      }),
    );
  }

  private createMonthlyBudgetItem(
    budget: CategoryBudgetModel,
    budgetAmount: number,
    spentAmount: number,
    historicalContext: HistoricalCategoryContext | null,
  ): MonthlyBudgetItemResponse {
    const remainingAmount = budgetAmount - spentAmount;
    const usageRatio =
      budgetAmount > 0
        ? spentAmount / budgetAmount
        : spentAmount === 0
          ? 1
          : null;

    return {
      budgetId: budget.id,
      categoryId: budget.categoryId,
      categoryName: budget.category.name,
      categoryArchivedAt: budget.category.archivedAt?.toISOString() ?? null,
      currency: budget.currency,
      budgetAmount,
      spentAmount,
      remainingAmount,
      usageRatio,
      status: this.resolveBudgetStatus(budgetAmount, spentAmount),
      previousMonthExpense: historicalContext?.previousMonthExpense ?? null,
      averageExpenseLast3Months:
        historicalContext?.averageExpenseLast3Months ?? null,
      startMonth: this.toMonthKey(budget.startMonth),
      endMonth: this.toOptionalMonthKey(budget.endMonth),
      override: budget.overrides[0]
        ? toCategoryBudgetOverrideResponse(budget.overrides[0])
        : null,
    };
  }

  private resolveBudgetStatus(
    budgetAmount: number,
    spentAmount: number,
  ): MonthlyBudgetItemResponse['status'] {
    if (spentAmount > budgetAmount) {
      return 'OVER_BUDGET';
    }

    if (spentAmount === budgetAmount) {
      return 'AT_LIMIT';
    }

    return 'WITHIN_BUDGET';
  }

  private createEmptyCurrencyTotals(
    currency: string,
  ): Omit<
    MonthlyBudgetCurrencySummaryResponse,
    'items' | 'overBudgetHighlights' | 'unbudgetedCategories'
  > {
    return {
      currency,
      budgetTotal: 0,
      spentTotal: 0,
      remainingTotal: 0,
      overBudgetTotal: 0,
      overBudgetCount: 0,
      budgetedCategoryCount: 0,
      unbudgetedExpenseTotal: 0,
      uncategorizedExpenseTotal: 0,
    };
  }

  private compareBudgetRows(
    left: CategoryBudgetModel,
    right: CategoryBudgetModel,
  ): number {
    if (left.currency !== right.currency) {
      return left.currency.localeCompare(right.currency);
    }

    if (left.category.order !== right.category.order) {
      return left.category.order - right.category.order;
    }

    return left.category.name.localeCompare(right.category.name);
  }

  private resolveOptionalMonthRange(
    from?: string,
    to?: string,
  ): {
    from: string;
    to: string;
  } | null {
    if (!from && !to) {
      return null;
    }

    if (!from || !to) {
      throw new BadRequestException('from and to must both be provided.');
    }

    const normalizedFrom = this.requireMonthKey(from, 'from');
    const normalizedTo = this.requireMonthKey(to, 'to');

    if (normalizedFrom > normalizedTo) {
      throw new BadRequestException('from must be less than or equal to to.');
    }

    const monthSpan = diffRomeMonths(normalizedFrom, normalizedTo) + 1;
    if (monthSpan > MAX_OVERRIDE_RANGE_MONTHS) {
      throw new BadRequestException(
        `Override range cannot exceed ${MAX_OVERRIDE_RANGE_MONTHS} months.`,
      );
    }

    return {
      from: normalizedFrom,
      to: normalizedTo,
    };
  }

  private assertMonthWithinBudgetCoverage(
    month: string,
    startMonth: string,
    endMonth: string | null,
    fieldName: string,
  ): void {
    if (month < startMonth || (endMonth !== null && month > endMonth)) {
      throw new BadRequestException(
        `${fieldName} must fall within the budget's active range.`,
      );
    }
  }

  private assertMonthRange(
    startMonth: string,
    endMonth: string | null,
    startFieldName: string,
    endFieldName: string,
  ): void {
    if (endMonth !== null && endMonth < startMonth) {
      throw new BadRequestException(
        `${endFieldName} must be greater than or equal to ${startFieldName}.`,
      );
    }
  }

  private requireMonthKey(value: string, fieldName: string): string {
    const normalized = value.trim();

    if (!LOCAL_MONTH_PATTERN.test(normalized)) {
      throw new BadRequestException(
        `${fieldName} must use the YYYY-MM format.`,
      );
    }

    return normalized;
  }

  private optionalMonthKey(
    value: string | null | undefined,
    fieldName: string,
  ): string | null {
    if (value === undefined || value === null || value === '') {
      return null;
    }

    return this.requireMonthKey(value, fieldName);
  }

  private requireCurrency(value: string): string {
    const normalized = value.trim().toUpperCase();

    if (!normalized) {
      throw new BadRequestException('currency is required.');
    }

    return normalized;
  }

  private optionalText(value: string | null | undefined): string | null {
    const normalized = value?.trim() ?? '';
    return normalized ? normalized : null;
  }

  private toDecimal(value: number): Prisma.Decimal {
    return new Prisma.Decimal(value);
  }

  private monthKeyToValue(monthKey: string): Date {
    return romeMonthToUtcStart(monthKey);
  }

  private toMonthKey(value: Date): string {
    return value.toISOString().slice(0, 7);
  }

  private toOptionalMonthKey(value: Date | null): string | null {
    return value ? this.toMonthKey(value) : null;
  }

  private categoryCurrencyKey(categoryId: string, currency: string): string {
    return `${categoryId}:${currency}`;
  }

  private async withSerializableRetry<T>(
    operation: () => Promise<T>,
    attempt = 0,
  ): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (attempt < 2 && this.isRetryablePrismaError(error)) {
        return this.withSerializableRetry(operation, attempt + 1);
      }

      throw error;
    }
  }

  private isRetryablePrismaError(
    error: unknown,
  ): error is Prisma.PrismaClientKnownRequestError {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      (error.code === 'P2002' || error.code === 'P2034')
    );
  }
}
