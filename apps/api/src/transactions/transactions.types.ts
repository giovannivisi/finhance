import { Prisma, TransactionKind } from '@finhance/db';

export type TransactionRecord = Prisma.TransactionGetPayload<{
  include: {
    account: true;
    category: {
      include: {
        parentCategory: true;
      };
    };
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

export interface SplitTransactionEntry {
  entryType: 'SPLIT';
  splitGroupId: string;
  rows: TransactionRecord[];
}

export type LogicalTransactionEntry =
  | StandardTransactionEntry
  | TransferTransactionEntry
  | SplitTransactionEntry;

export interface TransactionFilters {
  from?: string;
  to?: string;
  accountId?: string;
  categoryId?: string;
  primaryCategoryId?: string;
  secondaryCategoryId?: string;
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
  primaryCategoryId?: string;
  secondaryCategoryId?: string;
  includeArchivedAccounts?: boolean;
}

export interface MonthlyCashflowFilters {
  from: string;
  to: string;
  accountIds?: string[];
  categoryId?: string;
  primaryCategoryId?: string;
  secondaryCategoryId?: string;
  includeArchivedAccounts?: boolean;
}
