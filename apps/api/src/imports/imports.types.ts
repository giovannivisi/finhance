import type {
  ImportBatchSummaryResponse,
  ImportFileType,
  ImportRowIssueResponse,
} from '@finhance/shared';
import type {
  Account,
  Asset,
  AssetKind,
  AssetType,
  Category,
  CategoryType,
  LiabilityKind,
  Transaction,
  TransactionDirection,
  TransactionKind,
} from '@prisma/client';

export interface ImportUploadFile {
  originalName: string;
  buffer: Buffer;
}

export interface AccountImportRow {
  rowNumber: number;
  importKey: string;
  name: string;
  type: AssetlessAccountType;
  currency: string;
  institution: string | null;
  notes: string | null;
  order: number | null;
  archived: boolean;
}

export interface CategoryImportRow {
  rowNumber: number;
  importKey: string;
  name: string;
  type: CategoryType;
  order: number | null;
  archived: boolean;
}

export interface AssetImportRow {
  rowNumber: number;
  importKey: string;
  name: string;
  type: AssetType;
  kind: AssetKind | null;
  liabilityKind: LiabilityKind | null;
  currency: string;
  balance: string | null;
  accountImportKey: string | null;
  ticker: string | null;
  exchange: string | null;
  quantity: string | null;
  unitPrice: string | null;
  notes: string | null;
  order: number | null;
}

export interface TransactionImportRow {
  rowNumber: number;
  importKey: string;
  postedAt: string;
  kind: TransactionKind;
  amount: string;
  description: string;
  notes: string | null;
  accountImportKey: string | null;
  direction: TransactionDirection | null;
  categoryImportKey: string | null;
  counterparty: string | null;
  sourceAccountImportKey: string | null;
  destinationAccountImportKey: string | null;
}

export interface ImportPayload {
  providedFiles: ImportFileType[];
  accounts: AccountImportRow[];
  categories: CategoryImportRow[];
  assets: AssetImportRow[];
  transactions: TransactionImportRow[];
}

export interface ImportAnalysisState {
  importedAccountsByKey: Map<string, Account>;
  importedCategoriesByKey: Map<string, Category>;
  importedAssetsByKey: Map<string, Asset>;
  importedTransactionsByKey: Map<string, Transaction[]>;
  accountImportKeyById: Map<string, string>;
  categoryImportKeyById: Map<string, string>;
  activeCategories: Category[];
  marketAssetsByKey: Map<string, Asset[]>;
}

export interface ImportAnalysisResult {
  summary: ImportBatchSummaryResponse;
  issues: ImportRowIssueResponse[];
  canApply: boolean;
  state: ImportAnalysisState;
}

export const IMPORT_TEMPLATE_HEADERS: Record<
  ImportFileType,
  readonly string[]
> = {
  accounts: [
    'importKey',
    'name',
    'type',
    'currency',
    'institution',
    'notes',
    'order',
    'archived',
  ],
  categories: ['importKey', 'name', 'type', 'order', 'archived'],
  assets: [
    'importKey',
    'name',
    'type',
    'kind',
    'liabilityKind',
    'currency',
    'balance',
    'accountImportKey',
    'ticker',
    'exchange',
    'quantity',
    'unitPrice',
    'notes',
    'order',
  ],
  transactions: [
    'importKey',
    'postedAt',
    'kind',
    'amount',
    'description',
    'notes',
    'accountImportKey',
    'direction',
    'categoryImportKey',
    'counterparty',
    'sourceAccountImportKey',
    'destinationAccountImportKey',
  ],
};

type AssetlessAccountType = Account['type'];
