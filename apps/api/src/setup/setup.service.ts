import { Injectable } from '@nestjs/common';
import { AccountsService } from '@accounts/accounts.service';
import { PrismaService } from '@prisma/prisma.service';
import { CategoryType, ImportBatchStatus, type Account } from '@finhance/db';
import type {
  SetupHandoffResponse,
  SetupStatusResponse,
  SetupStepResponse,
  SetupWarningResponse,
} from '@finhance/shared';
import {
  romeMonthToUtcStart,
  utcDateToRomeMonth,
} from '@transactions/transactions.dates';

interface GetSetupStatusOptions {
  includeWarnings?: boolean;
}

@Injectable()
export class SetupService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accountsService: AccountsService,
  ) {}

  async getStatus(
    ownerId: string,
    options?: GetSetupStatusOptions,
  ): Promise<SetupStatusResponse> {
    const currentMonth = utcDateToRomeMonth(new Date());
    const monthValue = romeMonthToUtcStart(currentMonth);
    const includeWarnings = options?.includeWarnings ?? true;

    const [
      activeAccountCount,
      activeCategories,
      activeRecurringRuleCount,
      currentMonthBudgetCount,
      appliedImportCount,
      latestSnapshot,
      reconciliations,
      ownerUser,
    ] = await Promise.all([
      this.prisma.account.count({
        where: { userId: ownerId, archivedAt: null },
      }),
      this.prisma.category.findMany({
        where: { userId: ownerId, archivedAt: null },
        select: { type: true },
      }),
      this.prisma.recurringTransactionRule.count({
        where: { userId: ownerId, isActive: true },
      }),
      this.prisma.categoryBudget.count({
        where: {
          userId: ownerId,
          startMonth: { lte: monthValue },
          OR: [{ endMonth: null }, { endMonth: { gte: monthValue } }],
          category: { archivedAt: null },
        },
      }),
      this.prisma.importBatch.count({
        where: { userId: ownerId, status: ImportBatchStatus.APPLIED },
      }),
      this.prisma.netWorthSnapshot.findFirst({
        where: { userId: ownerId },
        orderBy: [{ snapshotDate: 'desc' }, { capturedAt: 'desc' }],
      }),
      includeWarnings
        ? this.accountsService.findReconciliation(ownerId, {
            includeArchived: false,
          })
        : Promise.resolve([]),
      this.prisma.user.findUnique({
        where: { id: ownerId },
        select: { userSettings: true },
      }),
    ]);

    const hasReportingCurrencyConfigured = this.hasReportingCurrencyConfigured(
      ownerUser?.userSettings ?? null,
    );

    const activeIncomeCategoryCount = activeCategories.filter(
      (category) => category.type === CategoryType.INCOME,
    ).length;
    const activeExpenseCategoryCount = activeCategories.filter(
      (category) => category.type === CategoryType.EXPENSE,
    ).length;
    const categoryStep = this.buildCategoryStep(
      activeIncomeCategoryCount,
      activeExpenseCategoryCount,
    );

    const requiredSteps: SetupStepResponse[] = [
      {
        code: 'ACCOUNTS',
        title: 'Create your first account',
        detail:
          activeAccountCount > 0
            ? `${activeAccountCount} active account${activeAccountCount === 1 ? '' : 's'} available.`
            : 'Add at least one active account before tracking balances or importing history.',
        status: activeAccountCount > 0 ? 'COMPLETE' : 'INCOMPLETE',
        href: '/accounts',
        actionLabel: activeAccountCount > 0 ? 'Open accounts' : 'Add account',
      },
      {
        code: 'REPORTING_CURRENCY',
        title: 'Choose the reporting currency',
        detail: hasReportingCurrencyConfigured
          ? 'Reporting currency is configured for aggregate totals.'
          : 'Choose the currency used for net worth, history, and converted summaries.',
        status: hasReportingCurrencyConfigured ? 'COMPLETE' : 'INCOMPLETE',
        href: '/settings/user',
        actionLabel: hasReportingCurrencyConfigured
          ? 'Review reporting currency'
          : 'Choose reporting currency',
      },
      {
        code: 'CATEGORIES',
        title: categoryStep.title,
        detail: categoryStep.detail,
        status: categoryStep.status,
        href: '/categories',
        actionLabel: categoryStep.actionLabel,
      },
    ];

    const recommendedSteps: SetupStepResponse[] = [
      {
        code: 'RECURRING',
        title: 'Add recurring rules',
        detail:
          activeRecurringRuleCount > 0
            ? `${activeRecurringRuleCount} active recurring rule${activeRecurringRuleCount === 1 ? '' : 's'} configured.`
            : 'Add recurring salary, rent, subscriptions, and transfers so due activity materializes automatically.',
        status: activeRecurringRuleCount > 0 ? 'COMPLETE' : 'INCOMPLETE',
        href: '/recurring',
        actionLabel:
          activeRecurringRuleCount > 0 ? 'Open recurring' : 'Set up recurring',
      },
      {
        code: 'BUDGETS',
        title: 'Create current-month budgets',
        detail:
          currentMonthBudgetCount > 0
            ? `${currentMonthBudgetCount} active budget plan${currentMonthBudgetCount === 1 ? '' : 's'} cover ${currentMonth}.`
            : `Create monthly expense budgets for ${currentMonth} to compare plan versus spending.`,
        status: currentMonthBudgetCount > 0 ? 'COMPLETE' : 'INCOMPLETE',
        href: `/budgets?month=${encodeURIComponent(currentMonth)}`,
        actionLabel:
          currentMonthBudgetCount > 0 ? 'Open budgets' : 'Set up budgets',
      },
    ];

    const warnings = this.buildWarnings(
      reconciliations,
      latestSnapshot !== null,
    );
    const requiredCompletedCount = requiredSteps.filter(
      (step) => step.status === 'COMPLETE',
    ).length;
    const isComplete = requiredCompletedCount === requiredSteps.length;

    return {
      isComplete,
      currentMonth,
      requiredCompletedCount,
      requiredTotalCount: requiredSteps.length,
      requiredSteps,
      recommendedSteps,
      warnings,
      handoff: isComplete
        ? this.buildHandoff(currentMonth, latestSnapshot !== null)
        : [],
      activeAccountCount,
      activeIncomeCategoryCount,
      activeExpenseCategoryCount,
      activeRecurringRuleCount,
      currentMonthBudgetCount,
      hasAppliedImportBatch: appliedImportCount > 0,
      hasSnapshot: latestSnapshot !== null,
      hasReportingCurrencyConfigured,
    };
  }

  private buildCategoryStep(
    activeIncomeCategoryCount: number,
    activeExpenseCategoryCount: number,
  ): Pick<SetupStepResponse, 'title' | 'detail' | 'status' | 'actionLabel'> {
    if (activeIncomeCategoryCount > 0 && activeExpenseCategoryCount > 0) {
      return {
        title: 'Set up income and expense categories',
        detail: `${activeIncomeCategoryCount} income and ${activeExpenseCategoryCount} expense categories ready.`,
        status: 'COMPLETE',
        actionLabel: 'Open categories',
      };
    }

    if (activeIncomeCategoryCount === 0 && activeExpenseCategoryCount > 0) {
      return {
        title: 'Add at least one income category',
        detail: `${activeExpenseCategoryCount} expense categor${activeExpenseCategoryCount === 1 ? 'y is' : 'ies are'} already available. Add an income category so inflows can be classified cleanly in review and analytics.`,
        status: 'INCOMPLETE',
        actionLabel: 'Add income category',
      };
    }

    if (activeIncomeCategoryCount > 0 && activeExpenseCategoryCount === 0) {
      return {
        title: 'Add at least one expense category',
        detail: `${activeIncomeCategoryCount} income categor${activeIncomeCategoryCount === 1 ? 'y is' : 'ies are'} already available. Add an expense category so spending, budgets, and monthly review can work.`,
        status: 'INCOMPLETE',
        actionLabel: 'Add expense category',
      };
    }

    return {
      title: 'Set up income and expense categories',
      detail:
        'Create at least one income category and one expense category so review, analytics, and budgets can work.',
      status: 'INCOMPLETE',
      actionLabel: 'Add categories',
    };
  }

  private buildWarnings(
    reconciliations: Array<{
      account: Account;
      status: string;
      diagnostics: Array<{ code: string }>;
    }>,
    hasSnapshot: boolean,
  ): SetupWarningResponse[] {
    const baselineMissingAccounts = reconciliations.filter((entry) =>
      entry.diagnostics.some(
        (diagnostic) => diagnostic.code === 'BASELINE_MISSING',
      ),
    );
    const reconciliationIssueAccounts = reconciliations.filter(
      (entry) =>
        entry.status !== 'CLEAN' ||
        entry.diagnostics.some(
          (diagnostic) => diagnostic.code !== 'BASELINE_MISSING',
        ),
    );

    const warnings: SetupWarningResponse[] = [];

    if (baselineMissingAccounts.length > 0) {
      warnings.push({
        code: 'BASELINE_MISSING',
        severity: 'WARNING',
        title: 'Some accounts still rely on full history',
        detail: `Opening-balance baselines are missing for ${this.describeAccounts(
          baselineMissingAccounts.map((entry) => entry.account.name),
        )}. That does not block setup, but it makes trust and reconciliation harder to explain.`,
        href: '/accounts',
        actionLabel: 'Review accounts',
        count: baselineMissingAccounts.length,
      });
    }

    if (reconciliationIssueAccounts.length > 0) {
      warnings.push({
        code: 'RECONCILIATION_ISSUES',
        severity: 'WARNING',
        title: 'Some accounts still need reconciliation attention',
        detail: `Diagnostics are still active for ${this.describeAccounts(
          reconciliationIssueAccounts.map((entry) => entry.account.name),
        )}. Review the account notes before trusting adjustments or monthly explanations.`,
        href: '/accounts',
        actionLabel: 'Open diagnostics',
        count: reconciliationIssueAccounts.length,
      });
    }

    if (!hasSnapshot) {
      warnings.push({
        code: 'NO_SNAPSHOT_YET',
        severity: 'INFO',
        title: 'No net worth snapshot yet',
        detail:
          'Capture your first snapshot when you are ready so history and monthly review have a real comparison point.',
        href: '/history',
        actionLabel: 'Open history',
        count: null,
      });
    }

    return warnings;
  }

  private buildHandoff(
    currentMonth: string,
    hasSnapshot: boolean,
  ): SetupHandoffResponse[] {
    return [
      {
        code: 'REVIEW',
        title: 'Open monthly review',
        detail: `Use review to understand what happened in ${currentMonth} and what still needs attention.`,
        href: `/review?month=${encodeURIComponent(currentMonth)}`,
        actionLabel: 'Open review',
      },
      {
        code: 'ANALYTICS',
        title: 'Explore multi-month trends',
        detail:
          'Use analytics to inspect spending trends, category shifts, and where money is going over time.',
        href: '/analytics',
        actionLabel: 'Open analytics',
      },
      {
        code: 'BUDGETS',
        title: 'Check monthly budgets',
        detail: `Compare planned expense limits with ${currentMonth} spending before you change next month’s plan.`,
        href: `/budgets?month=${encodeURIComponent(currentMonth)}`,
        actionLabel: 'Open budgets',
      },
      {
        code: 'HISTORY',
        title: hasSnapshot
          ? 'Review snapshot history'
          : 'Capture your first snapshot',
        detail: hasSnapshot
          ? 'History shows your stored net worth snapshots and lets you capture a fresh one when needed.'
          : 'History is where you capture the first snapshot that unlocks cleaner month-to-month review.',
        href: '/history',
        actionLabel: 'Open history',
      },
    ];
  }

  private describeAccounts(names: string[]): string {
    const uniqueNames = [...new Set(names)];
    const visible = uniqueNames.slice(0, 3);
    const suffix =
      uniqueNames.length > visible.length
        ? `, plus ${uniqueNames.length - visible.length} more`
        : '';

    return `${visible.join(', ')}${suffix}`;
  }

  private hasReportingCurrencyConfigured(value: unknown): boolean {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return false;
    }

    const candidate = (value as Record<string, unknown>).reportingCurrency;
    return typeof candidate === 'string' && candidate.trim().length > 0;
  }
}
