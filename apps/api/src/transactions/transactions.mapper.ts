import { Prisma } from '@finhance/db';
import type { TransactionResponse } from '@finhance/shared';
import { getCategoryHierarchyMetadata } from '@transactions/category-hierarchy';
import type { LogicalTransactionEntry } from '@transactions/transactions.types';

function decimalToNumber(value: Prisma.Decimal): number {
  return value.toNumber();
}

export function toTransactionResponse(
  entry: LogicalTransactionEntry,
): TransactionResponse {
  if (entry.entryType === 'STANDARD') {
    const { row } = entry;
    const categoryHierarchy = getCategoryHierarchyMetadata(row.category);

    return {
      id: row.id,
      postedAt: row.postedAt.toISOString(),
      amount: decimalToNumber(row.amount),
      currency: row.currency,
      kind: row.kind,
      accountId: row.accountId,
      direction: row.direction,
      categoryId: row.categoryId,
      primaryCategoryId: categoryHierarchy.primaryCategoryId,
      primaryCategoryName: categoryHierarchy.primaryCategoryName,
      secondaryCategoryId: categoryHierarchy.secondaryCategoryId,
      secondaryCategoryName: categoryHierarchy.secondaryCategoryName,
      description: row.description,
      notes: row.notes,
      counterparty: row.counterparty,
      sourceAccountId: null,
      destinationAccountId: null,
      splitGroupId: null,
      fundingLegs: null,
      recurringRuleId: row.recurringRuleId ?? null,
      recurringOccurrenceMonth:
        row.recurringOccurrenceMonth?.toISOString().slice(0, 10) ?? null,
      isRecurringGenerated: row.recurringRuleId != null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  if (entry.entryType === 'TRANSFER') {
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
      primaryCategoryId: null,
      primaryCategoryName: null,
      secondaryCategoryId: null,
      secondaryCategoryName: null,
      description: entry.outflow.description,
      notes: entry.outflow.notes,
      counterparty: null,
      sourceAccountId: entry.outflow.accountId,
      destinationAccountId: entry.inflow.accountId,
      splitGroupId: null,
      fundingLegs: null,
      recurringRuleId: entry.outflow.recurringRuleId ?? null,
      recurringOccurrenceMonth:
        entry.outflow.recurringOccurrenceMonth?.toISOString().slice(0, 10) ??
        null,
      isRecurringGenerated: entry.outflow.recurringRuleId != null,
      createdAt: createdAt.toISOString(),
      updatedAt: updatedAt.toISOString(),
    };
  }

  const [firstRow] = entry.rows;
  const createdAt = entry.rows.reduce(
    (currentEarliest, row) =>
      row.createdAt.getTime() < currentEarliest.getTime()
        ? row.createdAt
        : currentEarliest,
    firstRow.createdAt,
  );
  const updatedAt = entry.rows.reduce(
    (currentLatest, row) =>
      row.updatedAt.getTime() > currentLatest.getTime()
        ? row.updatedAt
        : currentLatest,
    firstRow.updatedAt,
  );
  const categoryHierarchy = getCategoryHierarchyMetadata(firstRow.category);

  return {
    id: entry.splitGroupId,
    postedAt: firstRow.postedAt.toISOString(),
    amount: entry.rows.reduce(
      (sum, row) => sum + decimalToNumber(row.amount),
      0,
    ),
    currency: firstRow.currency,
    kind: firstRow.kind,
    accountId: null,
    direction: firstRow.direction,
    categoryId: firstRow.categoryId,
    primaryCategoryId: categoryHierarchy.primaryCategoryId,
    primaryCategoryName: categoryHierarchy.primaryCategoryName,
    secondaryCategoryId: categoryHierarchy.secondaryCategoryId,
    secondaryCategoryName: categoryHierarchy.secondaryCategoryName,
    description: firstRow.description,
    notes: firstRow.notes,
    counterparty: firstRow.counterparty,
    sourceAccountId: null,
    destinationAccountId: null,
    splitGroupId: entry.splitGroupId,
    fundingLegs: entry.rows.map((row) => ({
      accountId: row.accountId,
      amount: decimalToNumber(row.amount),
      currency: row.currency,
    })),
    recurringRuleId: firstRow.recurringRuleId ?? null,
    recurringOccurrenceMonth:
      firstRow.recurringOccurrenceMonth?.toISOString().slice(0, 10) ?? null,
    isRecurringGenerated: firstRow.recurringRuleId != null,
    createdAt: createdAt.toISOString(),
    updatedAt: updatedAt.toISOString(),
  };
}
