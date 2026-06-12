import { Prisma } from '@finhance/db';
import type {
  ImportBatchSummaryResponse,
  ImportFileType,
  ImportIssueSeverity,
  ImportRowIssueResponse,
} from '@finhance/shared';
import type { ImportPayload } from '@imports/imports.types';

type ImportPayloadKey = keyof Omit<ImportPayload, 'providedFiles'>;
type ImportPayloadRow<K extends ImportPayloadKey> = ImportPayload[K][number];

const IMPORT_FILE_TYPES = new Set<ImportFileType>([
  'accounts',
  'categories',
  'assets',
  'transactions',
  'recurringRules',
  'recurringExceptions',
  'budgets',
  'budgetOverrides',
  'expenseCategoryHierarchy',
  'expenseValidationRules',
]);
const IMPORT_ISSUE_SEVERITIES = new Set<ImportIssueSeverity>([
  'ERROR',
  'WARNING',
]);
const ACCOUNT_TYPES = new Set<ImportPayload['accounts'][number]['type']>([
  'BANK',
  'BROKER',
  'CARD',
  'CASH',
  'LOAN',
  'OTHER',
]);
const CATEGORY_TYPES = new Set<ImportPayload['categories'][number]['type']>([
  'EXPENSE',
  'INCOME',
]);
const CATEGORY_LEVELS = new Set<ImportPayload['categories'][number]['level']>([
  'PRIMARY',
  'SECONDARY',
]);
const ASSET_TYPES = new Set<ImportPayload['assets'][number]['type']>([
  'ASSET',
  'LIABILITY',
]);
const ASSET_KINDS = new Set<
  NonNullable<ImportPayload['assets'][number]['kind']>
>([
  'CASH',
  'STOCK',
  'BOND',
  'CRYPTO',
  'REAL_ESTATE',
  'PENSION',
  'COMMODITY',
  'OTHER',
]);
const LIABILITY_KINDS = new Set<
  NonNullable<ImportPayload['assets'][number]['liabilityKind']>
>(['TAX', 'DEBT', 'OTHER']);
const TRANSACTION_KINDS = new Set<
  ImportPayload['transactions'][number]['kind']
>(['EXPENSE', 'INCOME', 'TRANSFER', 'ADJUSTMENT']);
const TRANSACTION_DIRECTIONS = new Set<
  NonNullable<ImportPayload['transactions'][number]['direction']>
>(['INFLOW', 'OUTFLOW']);
const RECURRING_STATUSES = new Set<
  ImportPayload['recurringExceptions'][number]['status']
>(['SKIPPED', 'OVERRIDDEN']);

export function serializeImportBatchValue(
  value: ImportBatchSummaryResponse | ImportRowIssueResponse[] | ImportPayload,
): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

export function parseStoredImportSummary(
  value: Prisma.JsonValue,
): ImportBatchSummaryResponse {
  const message = 'Stored import batch summary is invalid.';
  const summary = expectJsonObject(value, message);

  return {
    files: expectArray(summary['files'], message).map((file) =>
      parseStoredImportSummaryFile(file, message),
    ),
    errorCount: expectNumber(summary['errorCount'], message),
    warningCount: expectNumber(summary['warningCount'], message),
  };
}

export function parseStoredImportIssues(
  value: Prisma.JsonValue,
): ImportRowIssueResponse[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((issue) => {
    const parsed = parseStoredImportIssue(issue);
    return parsed ? [parsed] : [];
  });
}

export function parseStoredImportPayload(
  value: Prisma.JsonValue | null,
): ImportPayload | null {
  const message = 'Stored import batch payload is invalid.';

  try {
    const payload = expectJsonObject(value, message);

    return {
      providedFiles: expectArray(payload['providedFiles'], message).map(
        (entry) => expectEnumValue(entry, IMPORT_FILE_TYPES, message),
      ),
      accounts: parsePayloadRows(
        payload,
        'accounts',
        parseAccountImportRow,
        message,
      ),
      categories: parsePayloadRows(
        payload,
        'categories',
        parseCategoryImportRow,
        message,
      ),
      assets: parsePayloadRows(payload, 'assets', parseAssetImportRow, message),
      transactions: parsePayloadRows(
        payload,
        'transactions',
        parseTransactionImportRow,
        message,
      ),
      recurringRules: parsePayloadRows(
        payload,
        'recurringRules',
        parseRecurringRuleImportRow,
        message,
      ),
      recurringExceptions: parsePayloadRows(
        payload,
        'recurringExceptions',
        parseRecurringExceptionImportRow,
        message,
      ),
      budgets: parsePayloadRows(
        payload,
        'budgets',
        parseBudgetImportRow,
        message,
      ),
      budgetOverrides: parsePayloadRows(
        payload,
        'budgetOverrides',
        parseBudgetOverrideImportRow,
        message,
      ),
      expenseCategoryHierarchy: parsePayloadRows(
        payload,
        'expenseCategoryHierarchy',
        parseExpenseCategoryHierarchyImportRow,
        message,
      ),
      expenseValidationRules: parsePayloadRows(
        payload,
        'expenseValidationRules',
        parseExpenseValidationRuleImportRow,
        message,
      ),
    };
  } catch {
    return null;
  }
}

function parseStoredImportSummaryFile(
  value: Prisma.JsonValue,
  message: string,
): ImportBatchSummaryResponse['files'][number] {
  const file = expectJsonObject(value, message);

  return {
    file: expectEnumValue(file['file'], IMPORT_FILE_TYPES, message),
    createCount: expectNumber(file['createCount'], message),
    updateCount: expectNumber(file['updateCount'], message),
    unchangedCount: expectNumber(file['unchangedCount'], message),
  };
}

function parseStoredImportIssue(
  value: Prisma.JsonValue,
): ImportRowIssueResponse | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  const file = coerceImportFileType(value['file']);
  const message = coerceRequiredString(value['message']);

  if (!file || !message) {
    return null;
  }

  return {
    file,
    rowNumber: coerceIssueRowNumber(value['rowNumber']),
    field: coerceIssueField(value['field']),
    severity: coerceIssueSeverity(value['severity']) ?? 'ERROR',
    message,
  };
}

function parseAccountImportRow(
  value: Prisma.JsonValue,
  message: string,
): ImportPayloadRow<'accounts'> {
  const row = expectJsonObject(value, message);

  return {
    rowNumber: expectNumber(row['rowNumber'], message),
    importKey: expectString(row['importKey'], message),
    name: expectString(row['name'], message),
    type: expectEnumValue(row['type'], ACCOUNT_TYPES, message),
    currency: expectString(row['currency'], message),
    institution: expectNullableString(row['institution'], message),
    notes: expectNullableString(row['notes'], message),
    order: expectNullableNumber(row['order'], message),
    openingBalance: expectNullableString(row['openingBalance'], message),
    openingBalanceDate: expectNullableString(
      row['openingBalanceDate'],
      message,
    ),
    archived: expectBoolean(row['archived'], message),
  };
}

function parseCategoryImportRow(
  value: Prisma.JsonValue,
  message: string,
): ImportPayloadRow<'categories'> {
  const row = expectJsonObject(value, message);

  return {
    rowNumber: expectNumber(row['rowNumber'], message),
    importKey: expectString(row['importKey'], message),
    type: expectEnumValue(row['type'], CATEGORY_TYPES, message),
    level: expectEnumValue(row['level'], CATEGORY_LEVELS, message),
    primary: expectString(row['primary'], message),
    secondary: expectNullableString(row['secondary'], message),
    primaryOrder: expectNullableNumber(row['primaryOrder'], message),
    secondaryOrder: expectNullableNumber(row['secondaryOrder'], message),
    archived: expectBoolean(row['archived'], message),
  };
}

function parseAssetImportRow(
  value: Prisma.JsonValue,
  message: string,
): ImportPayloadRow<'assets'> {
  const row = expectJsonObject(value, message);

  return {
    rowNumber: expectNumber(row['rowNumber'], message),
    importKey: expectString(row['importKey'], message),
    name: expectString(row['name'], message),
    type: expectEnumValue(row['type'], ASSET_TYPES, message),
    kind: expectNullableEnumValue(row['kind'], ASSET_KINDS, message),
    liabilityKind: expectNullableEnumValue(
      row['liabilityKind'],
      LIABILITY_KINDS,
      message,
    ),
    currency: expectString(row['currency'], message),
    balance: expectNullableString(row['balance'], message),
    accountImportKey: expectNullableString(row['accountImportKey'], message),
    ticker: expectNullableString(row['ticker'], message),
    exchange: expectNullableString(row['exchange'], message),
    quantity: expectNullableString(row['quantity'], message),
    unitPrice: expectNullableString(row['unitPrice'], message),
    notes: expectNullableString(row['notes'], message),
    order: expectNullableNumber(row['order'], message),
  };
}

function parseTransactionImportRow(
  value: Prisma.JsonValue,
  message: string,
): ImportPayloadRow<'transactions'> {
  const row = expectJsonObject(value, message);

  return {
    rowNumber: expectNumber(row['rowNumber'], message),
    importKey: expectString(row['importKey'], message),
    postedAt: expectString(row['postedAt'], message),
    kind: expectEnumValue(row['kind'], TRANSACTION_KINDS, message),
    amount: expectString(row['amount'], message),
    description: expectString(row['description'], message),
    notes: expectNullableString(row['notes'], message),
    accountImportKey: expectNullableString(row['accountImportKey'], message),
    direction: expectNullableEnumValue(
      row['direction'],
      TRANSACTION_DIRECTIONS,
      message,
    ),
    categoryImportKey: expectNullableString(row['categoryImportKey'], message),
    counterparty: expectNullableString(row['counterparty'], message),
    sourceAccountImportKey: expectNullableString(
      row['sourceAccountImportKey'],
      message,
    ),
    destinationAccountImportKey: expectNullableString(
      row['destinationAccountImportKey'],
      message,
    ),
  };
}

function parseRecurringRuleImportRow(
  value: Prisma.JsonValue,
  message: string,
): ImportPayloadRow<'recurringRules'> {
  const row = expectJsonObject(value, message);

  return {
    rowNumber: expectNumber(row['rowNumber'], message),
    importKey: expectString(row['importKey'], message),
    name: expectString(row['name'], message),
    isActive: expectBoolean(row['isActive'], message),
    kind: expectEnumValue(row['kind'], TRANSACTION_KINDS, message),
    amount: expectString(row['amount'], message),
    dayOfMonth: expectNumber(row['dayOfMonth'], message),
    startDate: expectString(row['startDate'], message),
    endDate: expectNullableString(row['endDate'], message),
    accountImportKey: expectNullableString(row['accountImportKey'], message),
    direction: expectNullableEnumValue(
      row['direction'],
      TRANSACTION_DIRECTIONS,
      message,
    ),
    categoryImportKey: expectNullableString(row['categoryImportKey'], message),
    counterparty: expectNullableString(row['counterparty'], message),
    sourceAccountImportKey: expectNullableString(
      row['sourceAccountImportKey'],
      message,
    ),
    destinationAccountImportKey: expectNullableString(
      row['destinationAccountImportKey'],
      message,
    ),
    description: expectString(row['description'], message),
    notes: expectNullableString(row['notes'], message),
  };
}

function parseRecurringExceptionImportRow(
  value: Prisma.JsonValue,
  message: string,
): ImportPayloadRow<'recurringExceptions'> {
  const row = expectJsonObject(value, message);

  return {
    rowNumber: expectNumber(row['rowNumber'], message),
    recurringRuleImportKey: expectString(
      row['recurringRuleImportKey'],
      message,
    ),
    month: expectString(row['month'], message),
    status: expectEnumValue(row['status'], RECURRING_STATUSES, message),
    amount: expectNullableString(row['amount'], message),
    postedAtDate: expectNullableString(row['postedAtDate'], message),
    accountImportKey: expectNullableString(row['accountImportKey'], message),
    direction: expectNullableEnumValue(
      row['direction'],
      TRANSACTION_DIRECTIONS,
      message,
    ),
    categoryImportKey: expectNullableString(row['categoryImportKey'], message),
    counterparty: expectNullableString(row['counterparty'], message),
    sourceAccountImportKey: expectNullableString(
      row['sourceAccountImportKey'],
      message,
    ),
    destinationAccountImportKey: expectNullableString(
      row['destinationAccountImportKey'],
      message,
    ),
    description: expectNullableString(row['description'], message),
    notes: expectNullableString(row['notes'], message),
  };
}

function parseBudgetImportRow(
  value: Prisma.JsonValue,
  message: string,
): ImportPayloadRow<'budgets'> {
  const row = expectJsonObject(value, message);

  return {
    rowNumber: expectNumber(row['rowNumber'], message),
    importKey: expectString(row['importKey'], message),
    categoryImportKey: expectString(row['categoryImportKey'], message),
    currency: expectString(row['currency'], message),
    amount: expectString(row['amount'], message),
    startMonth: expectString(row['startMonth'], message),
    endMonth: expectNullableString(row['endMonth'], message),
  };
}

function parseBudgetOverrideImportRow(
  value: Prisma.JsonValue,
  message: string,
): ImportPayloadRow<'budgetOverrides'> {
  const row = expectJsonObject(value, message);

  return {
    rowNumber: expectNumber(row['rowNumber'], message),
    budgetImportKey: expectString(row['budgetImportKey'], message),
    month: expectString(row['month'], message),
    amount: expectString(row['amount'], message),
    note: expectNullableString(row['note'], message),
  };
}

function parseExpenseCategoryHierarchyImportRow(
  value: Prisma.JsonValue,
  message: string,
): ImportPayloadRow<'expenseCategoryHierarchy'> {
  const row = expectJsonObject(value, message);

  return {
    rowNumber: expectNumber(row['rowNumber'], message),
    level: expectEnumValue(row['level'], CATEGORY_LEVELS, message),
    primary: expectString(row['primary'], message),
    secondary: expectNullableString(row['secondary'], message),
    primaryOrder: expectNullableNumber(row['primaryOrder'], message),
    secondaryOrder: expectNullableNumber(row['secondaryOrder'], message),
  };
}

function parseExpenseValidationRuleImportRow(
  value: Prisma.JsonValue,
  message: string,
): ImportPayloadRow<'expenseValidationRules'> {
  const row = expectJsonObject(value, message);

  return {
    rowNumber: expectNumber(row['rowNumber'], message),
    entry: expectString(row['entry'], message),
    primary: expectString(row['primary'], message),
    secondary: expectString(row['secondary'], message),
  };
}

function parsePayloadRows<K extends ImportPayloadKey>(
  payload: Prisma.JsonObject,
  key: K,
  parseRow: (value: Prisma.JsonValue, message: string) => ImportPayloadRow<K>,
  message: string,
): Array<ImportPayloadRow<K>> {
  return expectArray(payload[key], message).map((entry) =>
    parseRow(entry, message),
  );
}

function expectJsonObject(
  value: Prisma.JsonValue | null | undefined,
  message: string,
): Prisma.JsonObject {
  if (
    value === null ||
    value === undefined ||
    typeof value !== 'object' ||
    Array.isArray(value)
  ) {
    throw new Error(message);
  }

  return value;
}

function expectArray(
  value: Prisma.JsonValue | null | undefined,
  message: string,
): Prisma.JsonArray {
  if (!Array.isArray(value)) {
    throw new Error(message);
  }

  return value;
}

function expectString(
  value: Prisma.JsonValue | null | undefined,
  message: string,
): string {
  if (typeof value !== 'string') {
    throw new Error(message);
  }

  return value;
}

function expectNullableString(
  value: Prisma.JsonValue | null | undefined,
  message: string,
): string | null {
  if (value === null) {
    return null;
  }

  return expectString(value, message);
}

function expectNumber(
  value: Prisma.JsonValue | null | undefined,
  message: string,
): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(message);
  }

  return value;
}

function expectNullableNumber(
  value: Prisma.JsonValue | null | undefined,
  message: string,
): number | null {
  if (value === null) {
    return null;
  }

  return expectNumber(value, message);
}

function expectBoolean(
  value: Prisma.JsonValue | null | undefined,
  message: string,
): boolean {
  if (typeof value !== 'boolean') {
    throw new Error(message);
  }

  return value;
}

function expectEnumValue<T extends string>(
  value: Prisma.JsonValue | null | undefined,
  allowed: Set<T>,
  message: string,
): T {
  if (typeof value !== 'string' || !allowed.has(value as T)) {
    throw new Error(message);
  }

  return value as T;
}

function expectNullableEnumValue<T extends string>(
  value: Prisma.JsonValue | null | undefined,
  allowed: Set<T>,
  message: string,
): T | null {
  if (value === null) {
    return null;
  }

  return expectEnumValue(value, allowed, message);
}

function coerceIssueRowNumber(
  value: Prisma.JsonValue | null | undefined,
): number {
  const fromNumber =
    typeof value === 'number' && Number.isFinite(value)
      ? Math.trunc(value)
      : null;

  if (fromNumber !== null) {
    return Math.max(1, fromNumber);
  }

  if (typeof value === 'string' && /^-?\d+$/.test(value.trim())) {
    return Math.max(1, Number.parseInt(value.trim(), 10));
  }

  return 1;
}

function coerceIssueField(
  value: Prisma.JsonValue | null | undefined,
): string | null {
  return typeof value === 'string' ? value : null;
}

function coerceIssueSeverity(
  value: Prisma.JsonValue | null | undefined,
): ImportIssueSeverity | null {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim().toUpperCase();
  return IMPORT_ISSUE_SEVERITIES.has(normalized as ImportIssueSeverity)
    ? (normalized as ImportIssueSeverity)
    : null;
}

function coerceImportFileType(
  value: Prisma.JsonValue | null | undefined,
): ImportFileType | null {
  return typeof value === 'string' &&
    IMPORT_FILE_TYPES.has(value as ImportFileType)
    ? (value as ImportFileType)
    : null;
}

function coerceRequiredString(
  value: Prisma.JsonValue | null | undefined,
): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}
