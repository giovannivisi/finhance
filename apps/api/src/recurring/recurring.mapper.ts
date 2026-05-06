import { Prisma } from '@finhance/db';
import type {
  MonthlyReviewCurrencyInsightResponse,
  MonthlyReviewNetWorthExplanationResponse,
  MonthlyReviewRecurringComparisonResponse,
  MonthlyReviewResponse,
  MonthlyReviewWarningResponse,
  RecurringOccurrenceResponse,
  RecurringTransactionRuleResponse,
} from '@finhance/shared';
import type { AccountReconciliationModel } from '@accounts/accounts.service';
import { toAccountReconciliationResponse } from '@accounts/accounts.mapper';
import type { NetWorthSnapshot } from '@finhance/db';
import {
  getCategoryHierarchyMetadata,
  type HierarchicalCategoryRecord,
} from '@transactions/category-hierarchy';

const USER_VISIBLE_MATERIALIZATION_ERROR =
  'Unable to materialize this recurring rule. Review the rule configuration and try again.';

function decimalToNumber(value: Prisma.Decimal): number {
  return value.toNumber();
}

function toDateOnly(value: Date | null): string | null {
  return value?.toISOString().slice(0, 10) ?? null;
}

export interface RecurringTransactionRuleResponseModel {
  id: string;
  name: string;
  isActive: boolean;
  kind: RecurringTransactionRuleResponse['kind'];
  amount: Prisma.Decimal;
  dayOfMonth: number;
  startDate: Date;
  endDate: Date | null;
  accountId: string | null;
  direction: RecurringTransactionRuleResponse['direction'];
  categoryId: string | null;
  category: HierarchicalCategoryRecord | null;
  counterparty: string | null;
  sourceAccountId: string | null;
  destinationAccountId: string | null;
  description: string;
  notes: string | null;
  lastMaterializationError: string | null;
  lastMaterializationErrorAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export function toRecurringTransactionRuleResponse(
  rule: RecurringTransactionRuleResponseModel,
): RecurringTransactionRuleResponse {
  const categoryHierarchy = getCategoryHierarchyMetadata(rule.category);
  return {
    id: rule.id,
    name: rule.name,
    isActive: rule.isActive,
    kind: rule.kind,
    amount: decimalToNumber(rule.amount),
    dayOfMonth: rule.dayOfMonth,
    startDate: rule.startDate.toISOString().slice(0, 10),
    endDate: toDateOnly(rule.endDate),
    accountId: rule.accountId,
    direction: rule.direction,
    categoryId: rule.categoryId,
    primaryCategoryId: categoryHierarchy.primaryCategoryId,
    primaryCategoryName: categoryHierarchy.primaryCategoryName,
    secondaryCategoryId: categoryHierarchy.secondaryCategoryId,
    secondaryCategoryName: categoryHierarchy.secondaryCategoryName,
    counterparty: rule.counterparty,
    sourceAccountId: rule.sourceAccountId,
    destinationAccountId: rule.destinationAccountId,
    description: rule.description,
    notes: rule.notes,
    lastMaterializationError: rule.lastMaterializationError
      ? USER_VISIBLE_MATERIALIZATION_ERROR
      : null,
    lastMaterializationErrorAt:
      rule.lastMaterializationErrorAt?.toISOString() ?? null,
    createdAt: rule.createdAt.toISOString(),
    updatedAt: rule.updatedAt.toISOString(),
  };
}

export interface RecurringOccurrenceResponseModel {
  id: string;
  recurringRuleId: string;
  occurrenceMonth: Date;
  status: RecurringOccurrenceResponse['status'];
  overrideAmount: Prisma.Decimal | null;
  overridePostedAtDate: Date | null;
  overrideAccountId: string | null;
  overrideDirection: RecurringOccurrenceResponse['direction'];
  overrideCategoryId: string | null;
  overrideCounterparty: string | null;
  overrideSourceAccountId: string | null;
  overrideDestinationAccountId: string | null;
  overrideDescription: string | null;
  overrideNotes: string | null;
  createdAt: Date;
  updatedAt: Date;
  recurringRule: RecurringTransactionRuleResponseModel;
  resolvedCategory: HierarchicalCategoryRecord | null;
}

export function toRecurringOccurrenceResponse(
  occurrence: RecurringOccurrenceResponseModel,
): RecurringOccurrenceResponse {
  const categoryHierarchy = getCategoryHierarchyMetadata(
    occurrence.resolvedCategory,
  );
  return {
    id: occurrence.id,
    recurringRuleId: occurrence.recurringRuleId,
    recurringRuleName: occurrence.recurringRule.name,
    kind: occurrence.recurringRule.kind,
    occurrenceMonth: occurrence.occurrenceMonth.toISOString().slice(0, 7),
    status: occurrence.status,
    amount: occurrence.overrideAmount?.toNumber() ?? null,
    postedAtDate: toDateOnly(occurrence.overridePostedAtDate),
    accountId: occurrence.overrideAccountId,
    direction: occurrence.overrideDirection,
    categoryId: occurrence.resolvedCategory?.id ?? null,
    primaryCategoryId: categoryHierarchy.primaryCategoryId,
    primaryCategoryName: categoryHierarchy.primaryCategoryName,
    secondaryCategoryId: categoryHierarchy.secondaryCategoryId,
    secondaryCategoryName: categoryHierarchy.secondaryCategoryName,
    counterparty: occurrence.overrideCounterparty,
    sourceAccountId: occurrence.overrideSourceAccountId,
    destinationAccountId: occurrence.overrideDestinationAccountId,
    description: occurrence.overrideDescription,
    notes: occurrence.overrideNotes,
    createdAt: occurrence.createdAt.toISOString(),
    updatedAt: occurrence.updatedAt.toISOString(),
  };
}

export function toMonthlyReviewResponse(input: {
  month: string;
  cashflow: MonthlyReviewResponse['cashflow'];
  openingSnapshot: NetWorthSnapshot | null;
  closingSnapshot: NetWorthSnapshot | null;
  warnings: MonthlyReviewWarningResponse[];
  netWorthExplanation: MonthlyReviewNetWorthExplanationResponse;
  recurringComparison: MonthlyReviewRecurringComparisonResponse[];
  currencyInsights: MonthlyReviewCurrencyInsightResponse[];
  budgetSummary: MonthlyReviewResponse['budgetSummary'];
  budgetHighlights: MonthlyReviewResponse['budgetHighlights'];
  reconciliationHighlights: AccountReconciliationModel[];
  recurringExceptions: RecurringOccurrenceResponseModel[];
}): MonthlyReviewResponse {
  const openingNetWorth =
    input.openingSnapshot?.netWorthTotal.toNumber() ?? null;
  const closingNetWorth =
    input.closingSnapshot?.netWorthTotal.toNumber() ?? null;

  return {
    month: input.month,
    cashflow: input.cashflow,
    openingNetWorth,
    closingNetWorth,
    netWorthDelta:
      openingNetWorth === null || closingNetWorth === null
        ? null
        : closingNetWorth - openingNetWorth,
    openingSnapshotDate: toDateOnly(
      input.openingSnapshot?.snapshotDate ?? null,
    ),
    closingSnapshotDate: toDateOnly(
      input.closingSnapshot?.snapshotDate ?? null,
    ),
    warnings: input.warnings,
    netWorthExplanation: input.netWorthExplanation,
    recurringComparison: input.recurringComparison,
    currencyInsights: input.currencyInsights,
    budgetSummary: input.budgetSummary,
    budgetHighlights: input.budgetHighlights,
    reconciliationHighlights: input.reconciliationHighlights.map(
      toAccountReconciliationResponse,
    ),
    recurringExceptions: input.recurringExceptions.map(
      toRecurringOccurrenceResponse,
    ),
  };
}
