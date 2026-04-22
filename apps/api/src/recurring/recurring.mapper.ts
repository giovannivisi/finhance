import { Prisma } from '@prisma/client';
import type {
  MonthlyReviewResponse,
  RecurringOccurrenceResponse,
  RecurringTransactionRuleResponse,
} from '@finhance/shared';
import type { AccountReconciliationModel } from '@accounts/accounts.service';
import { toAccountReconciliationResponse } from '@accounts/accounts.mapper';
import type {
  RecurringTransactionRule,
  NetWorthSnapshot,
} from '@prisma/client';

function decimalToNumber(value: Prisma.Decimal): number {
  return value.toNumber();
}

function toDateOnly(value: Date | null): string | null {
  return value?.toISOString().slice(0, 10) ?? null;
}

export function toRecurringTransactionRuleResponse(
  rule: RecurringTransactionRule,
): RecurringTransactionRuleResponse {
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
    counterparty: rule.counterparty,
    sourceAccountId: rule.sourceAccountId,
    destinationAccountId: rule.destinationAccountId,
    description: rule.description,
    notes: rule.notes,
    lastMaterializationError: rule.lastMaterializationError,
    lastMaterializationErrorAt:
      rule.lastMaterializationErrorAt?.toISOString() ?? null,
    createdAt: rule.createdAt.toISOString(),
    updatedAt: rule.updatedAt.toISOString(),
  };
}

type RecurringOccurrenceWithRule =
  Prisma.RecurringTransactionOccurrenceGetPayload<{
    include: {
      recurringRule: true;
    };
  }>;

export function toRecurringOccurrenceResponse(
  occurrence: RecurringOccurrenceWithRule,
): RecurringOccurrenceResponse {
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
    categoryId: occurrence.overrideCategoryId,
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
  reconciliationHighlights: AccountReconciliationModel[];
  recurringExceptions: RecurringOccurrenceWithRule[];
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
    reconciliationHighlights: input.reconciliationHighlights.map(
      toAccountReconciliationResponse,
    ),
    recurringExceptions: input.recurringExceptions.map(
      toRecurringOccurrenceResponse,
    ),
  };
}
