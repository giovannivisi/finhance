import { Prisma, TransactionKind } from '@prisma/client';

export type TransactionRecord = Prisma.TransactionGetPayload<{
  include: {
    account: true;
    category: true;
  };
}>;

export interface StandardTransactionEntry {
  entryType: 'STANDARD';
  row: TransactionRecord;
}

export interface TransferTransactionEntry {
  entryType: 'TRANSFER';
  transferGroupId: string;
  outflow: TransactionRecord;
  inflow: TransactionRecord;
}

export type LogicalTransactionEntry =
  | StandardTransactionEntry
  | TransferTransactionEntry;

export interface TransactionFilters {
  from?: string;
  to?: string;
  accountId?: string;
  categoryId?: string;
  kind?: TransactionKind;
  includeArchivedAccounts?: boolean;
  limit?: number;
  offset?: number;
}

export interface CashflowFilters {
  from?: string;
  to?: string;
  accountId?: string;
  categoryId?: string;
  includeArchivedAccounts?: boolean;
}

export interface MonthlyCashflowFilters {
  from: string;
  to: string;
  accountIds?: string[];
  includeArchivedAccounts?: boolean;
}
