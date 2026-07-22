import type {
  AiTransactionDraft,
  AiTransactionDraftKind,
  AiTransactionDraftPaymentMethod,
} from '@finhance/shared';
import { isSupportedCurrencyCode } from '@/common/catalogues';
import { redactCloudParserText } from '@/ai/redaction';

type CloudDraftField = Omit<AiTransactionDraft, 'parsedBy' | 'cloudAttempted'>;

const PAYMENT_METHODS = new Set<AiTransactionDraftPaymentMethod>([
  'cash',
  'card',
  'unknown',
]);
const TRANSACTION_KINDS = new Set<AiTransactionDraftKind>([
  'EXPENSE',
  'INCOME',
]);

export function validateCloudTransactionDraft(
  value: unknown,
): CloudDraftField | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  const draft = value as Record<string, unknown>;
  const kind = nullableTransactionKind(draft.kind);
  const amount = nullableAmount(draft.amount);
  const currency = nullableCurrency(draft.currency);
  const postedAt = nullableDate(draft.postedAt);
  const description = requiredText(draft.description, 240);
  const counterparty = nullableText(draft.counterparty, 120);
  const paymentMethod = parsePaymentMethod(draft.paymentMethod);
  const cardLast4 = nullableCardLastFour(draft.cardLast4);

  if (
    kind === undefined ||
    amount === undefined ||
    currency === undefined ||
    postedAt === undefined ||
    !description ||
    counterparty === undefined ||
    !paymentMethod ||
    cardLast4 === undefined
  ) {
    return null;
  }

  return {
    kind,
    amount,
    currency,
    postedAt,
    description,
    counterparty,
    paymentMethod,
    cardLast4,
  };
}

function nullableTransactionKind(
  value: unknown,
): AiTransactionDraftKind | null | undefined {
  if (value === null) {
    return null;
  }

  return typeof value === 'string' && TRANSACTION_KINDS.has(value as never)
    ? (value as AiTransactionDraftKind)
    : undefined;
}

function nullableAmount(value: unknown): number | null | undefined {
  if (value === null) {
    return null;
  }

  return typeof value === 'number' &&
    Number.isFinite(value) &&
    value > 0 &&
    value <= 1_000_000_000
    ? value
    : undefined;
}

function nullableCurrency(value: unknown): string | null | undefined {
  if (value === null) {
    return null;
  }

  if (typeof value !== 'string') {
    return undefined;
  }

  const normalized = value.trim().toUpperCase();
  return isSupportedCurrencyCode(normalized) ? normalized : undefined;
}

function nullableDate(value: unknown): string | null | undefined {
  if (value === null) {
    return null;
  }

  if (typeof value !== 'string' || !isDateOnly(value)) {
    return undefined;
  }

  return value;
}

function requiredText(value: unknown, maximumLength: number): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = redactCloudParserText(value).trim();
  return normalized && normalized.length <= maximumLength ? normalized : null;
}

function nullableText(
  value: unknown,
  maximumLength: number,
): string | null | undefined {
  if (value === null) {
    return null;
  }

  if (typeof value !== 'string') {
    return undefined;
  }

  const normalized = redactCloudParserText(value).trim();
  return normalized && normalized.length <= maximumLength ? normalized : null;
}

function parsePaymentMethod(
  value: unknown,
): AiTransactionDraftPaymentMethod | null {
  return typeof value === 'string' && PAYMENT_METHODS.has(value as never)
    ? (value as AiTransactionDraftPaymentMethod)
    : null;
}

function nullableCardLastFour(value: unknown): string | null | undefined {
  if (value === null) {
    return null;
  }

  return typeof value === 'string' && /^\d{4}$/.test(value) ? value : undefined;
}

function isDateOnly(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    return false;
  }

  const [year, month, day] = match.slice(1).map(Number);
  const date = new Date(Date.UTC(year, (month ?? 1) - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === (month ?? 1) - 1 &&
    date.getUTCDate() === day
  );
}
