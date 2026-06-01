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
  CategoryBudget,
  CategoryBudgetOverride,
  Category,
  CategoryType,
  LiabilityKind,
  RecurringOccurrenceStatus,
  RecurringTransactionOccurrence,
  RecurringTransactionRule,
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
  openingBalance: string | null;
  openingBalanceDate: string | null;
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

export interface RecurringRuleImportRow {
  rowNumber: number;
  importKey: string;
  name: string;
  isActive: boolean;
  kind: TransactionKind;
  amount: string;
  dayOfMonth: number;
  startDate: string;
  endDate: string | null;
  accountImportKey: string | null;
  direction: TransactionDirection | null;
  categoryImportKey: string | null;
  counterparty: string | null;
  sourceAccountImportKey: string | null;
  destinationAccountImportKey: string | null;
  description: string;
  notes: string | null;
}

export interface RecurringExceptionImportRow {
  rowNumber: number;
  recurringRuleImportKey: string;
  month: string;
  status: RecurringOccurrenceStatus;
  amount: string | null;
  postedAtDate: string | null;
  accountImportKey: string | null;
  direction: TransactionDirection | null;
  categoryImportKey: string | null;
  counterparty: string | null;
  sourceAccountImportKey: string | null;
  destinationAccountImportKey: string | null;
  description: string | null;
  notes: string | null;
}

export interface BudgetImportRow {
  rowNumber: number;
  importKey: string;
  categoryImportKey: string;
  currency: string;
  amount: string;
  startMonth: string;
  endMonth: string | null;
}

export interface BudgetOverrideImportRow {
  rowNumber: number;
  budgetImportKey: string;
  month: string;
  amount: string;
  note: string | null;
}

export interface ImportPayload {
  providedFiles: ImportFileType[];
  accounts: AccountImportRow[];
  categories: CategoryImportRow[];
  assets: AssetImportRow[];
  transactions: TransactionImportRow[];
  recurringRules: RecurringRuleImportRow[];
  recurringExceptions: RecurringExceptionImportRow[];
  budgets: BudgetImportRow[];
  budgetOverrides: BudgetOverrideImportRow[];
}

export interface ImportAnalysisState {
  importedAccountsByKey: Map<string, Account>;
  importedCategoriesByKey: Map<string, Category>;
  importedAssetsByKey: Map<string, Asset>;
  importedTransactionsByKey: Map<string, Transaction[]>;
  importedRecurringRulesByKey: Map<string, RecurringTransactionRule>;
  importedRecurringExceptionsByRuleMonthKey: Map<
    string,
    RecurringTransactionOccurrence
  >;
  importedBudgetsByKey: Map<string, CategoryBudget>;
  importedBudgetOverridesByBudgetMonthKey: Map<string, CategoryBudgetOverride>;
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
    'openingBalance',
    'openingBalanceDate',
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
  recurringRules: [
    'importKey',
    'name',
    'isActive',
    'kind',
    'amount',
    'dayOfMonth',
    'startDate',
    'endDate',
    'accountImportKey',
    'direction',
    'categoryImportKey',
    'counterparty',
    'sourceAccountImportKey',
    'destinationAccountImportKey',
    'description',
    'notes',
  ],
  recurringExceptions: [
    'recurringRuleImportKey',
    'month',
    'status',
    'amount',
    'postedAtDate',
    'accountImportKey',
    'direction',
    'categoryImportKey',
    'counterparty',
    'sourceAccountImportKey',
    'destinationAccountImportKey',
    'description',
    'notes',
  ],
  budgets: [
    'importKey',
    'categoryImportKey',
    'currency',
    'amount',
    'startMonth',
    'endMonth',
  ],
  budgetOverrides: ['budgetImportKey', 'month', 'amount', 'note'],
};

type AssetlessAccountType = Account['type'];
