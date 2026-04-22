import { Prisma } from '@prisma/client';
import type { TransactionResponse } from '@finhance/shared';
import type { LogicalTransactionEntry } from '@transactions/transactions.types';

function decimalToNumber(value: Prisma.Decimal): number {
  return value.toNumber();
}

export function toTransactionResponse(
  entry: LogicalTransactionEntry,
): TransactionResponse {
  if (entry.entryType === 'STANDARD') {
    const { row } = entry;

    return {
      id: row.id,
      postedAt: row.postedAt.toISOString(),
      amount: decimalToNumber(row.amount),
      currency: row.currency,
      kind: row.kind,
      accountId: row.accountId,
      direction: row.direction,
      categoryId: row.categoryId,
      description: row.description,
      notes: row.notes,
      counterparty: row.counterparty,
      sourceAccountId: null,
      destinationAccountId: null,
      recurringRuleId: row.recurringRuleId ?? null,
      recurringOccurrenceMonth:
        row.recurringOccurrenceMonth?.toISOString().slice(0, 10) ?? null,
      isRecurringGenerated: row.recurringRuleId != null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  const createdAt =
    entry.outflow.createdAt.getTime() <= entry.inflow.createdAt.getTime()
      ? entry.outflow.createdAt
      : entry.inflow.createdAt;
  const updatedAt =
    entry.outflow.updatedAt.getTime() >= entry.inflow.updatedAt.getTime()
      ? entry.outflow.updatedAt
      : entry.inflow.updatedAt;

  return {
    id: entry.transferGroupId,
    postedAt: entry.outflow.postedAt.toISOString(),
    amount: decimalToNumber(entry.outflow.amount),
    currency: entry.outflow.currency,
    kind: 'TRANSFER',
    accountId: null,
    direction: null,
    categoryId: null,
    description: entry.outflow.description,
    notes: entry.outflow.notes,
    counterparty: null,
    sourceAccountId: entry.outflow.accountId,
    destinationAccountId: entry.inflow.accountId,
    recurringRuleId: entry.outflow.recurringRuleId ?? null,
    recurringOccurrenceMonth:
      entry.outflow.recurringOccurrenceMonth?.toISOString().slice(0, 10) ??
      null,
    isRecurringGenerated: entry.outflow.recurringRuleId != null,
    createdAt: createdAt.toISOString(),
    updatedAt: updatedAt.toISOString(),
  };
}
