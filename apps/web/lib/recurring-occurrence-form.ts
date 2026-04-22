import type {
  RecurringOccurrenceResponse,
  RecurringTransactionRuleResponse,
  TransactionDirection,
  TransactionKind,
  TransactionResponse,
  UpsertRecurringOccurrenceRequest,
} from "@finhance/shared";

export interface RecurringOccurrenceFormValues {
  occurrenceMonth: string;
  kind: TransactionKind;
  postedAtDate: string;
  amount: string;
  description: string;
  notes: string;
  accountId: string;
  direction: TransactionDirection;
  categoryId: string;
  counterparty: string;
  sourceAccountId: string;
  destinationAccountId: string;
}

const DEFAULT_DIRECTION: TransactionDirection = "OUTFLOW";

export function createRecurringOccurrenceFormValuesFromRule(
  rule: RecurringTransactionRuleResponse,
  occurrenceMonth: string,
  occurrence?: RecurringOccurrenceResponse | null,
): RecurringOccurrenceFormValues {
  const postedAtDate =
    occurrence?.postedAtDate ??
    clampDateToMonth(occurrenceMonth, rule.dayOfMonth);

  if (rule.kind === "TRANSFER") {
    return {
      occurrenceMonth,
      kind: rule.kind,
      postedAtDate,
      amount: String(occurrence?.amount ?? rule.amount),
      description: occurrence?.description ?? rule.description,
      notes: occurrence?.notes ?? rule.notes ?? "",
      accountId: "",
      direction: DEFAULT_DIRECTION,
      categoryId: "",
      counterparty: "",
      sourceAccountId:
        occurrence?.sourceAccountId ?? rule.sourceAccountId ?? "",
      destinationAccountId:
        occurrence?.destinationAccountId ?? rule.destinationAccountId ?? "",
    };
  }

  return {
    occurrenceMonth,
    kind: rule.kind,
    postedAtDate,
    amount: String(occurrence?.amount ?? rule.amount),
    description: occurrence?.description ?? rule.description,
    notes: occurrence?.notes ?? rule.notes ?? "",
    accountId: occurrence?.accountId ?? rule.accountId ?? "",
    direction:
      occurrence?.direction ??
      rule.direction ??
      (rule.kind === "INCOME" ? "INFLOW" : DEFAULT_DIRECTION),
    categoryId: occurrence?.categoryId ?? rule.categoryId ?? "",
    counterparty: occurrence?.counterparty ?? rule.counterparty ?? "",
    sourceAccountId: "",
    destinationAccountId: "",
  };
}

export function recurringTransactionToOccurrenceFormValues(
  transaction: TransactionResponse,
): RecurringOccurrenceFormValues {
  return {
    occurrenceMonth:
      transaction.recurringOccurrenceMonth?.slice(0, 7) ??
      transaction.postedAt.slice(0, 7),
    kind: transaction.kind,
    postedAtDate: transaction.postedAt.slice(0, 10),
    amount: String(transaction.amount),
    description: transaction.description,
    notes: transaction.notes ?? "",
    accountId: transaction.accountId ?? "",
    direction:
      transaction.direction ??
      (transaction.kind === "INCOME" ? "INFLOW" : DEFAULT_DIRECTION),
    categoryId: transaction.categoryId ?? "",
    counterparty: transaction.counterparty ?? "",
    sourceAccountId: transaction.sourceAccountId ?? "",
    destinationAccountId: transaction.destinationAccountId ?? "",
  };
}

export function buildRecurringOccurrencePayload(
  values: RecurringOccurrenceFormValues,
): {
  payload?: UpsertRecurringOccurrenceRequest;
  error?: string;
} {
  const amount = parseNumber(values.amount);
  const postedAtDate = values.postedAtDate.trim();
  const description = values.description.trim();
  const notes = values.notes.trim() || null;

  if (!/^\d{4}-\d{2}$/.test(values.occurrenceMonth)) {
    return { error: "Occurrence month must use YYYY-MM." };
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(postedAtDate)) {
    return { error: "Please enter a valid occurrence date." };
  }

  if (postedAtDate.slice(0, 7) !== values.occurrenceMonth) {
    return {
      error: "Occurrence date must stay inside the selected month.",
    };
  }

  if (amount === null || amount <= 0) {
    return { error: "Please enter a positive amount." };
  }

  if (!description) {
    return { error: "Description is required." };
  }

  if (values.kind === "TRANSFER") {
    const sourceAccountId = values.sourceAccountId.trim();
    const destinationAccountId = values.destinationAccountId.trim();

    if (!sourceAccountId || !destinationAccountId) {
      return {
        error:
          "Transfers require both a source account and a destination account.",
      };
    }

    if (sourceAccountId === destinationAccountId) {
      return {
        error: "Transfers require two different accounts.",
      };
    }

    return {
      payload: {
        status: "OVERRIDDEN",
        amount,
        postedAtDate,
        sourceAccountId,
        destinationAccountId,
        description,
        notes,
      },
    };
  }

  const accountId = values.accountId.trim();
  if (!accountId) {
    return { error: "Please choose an account." };
  }

  const direction =
    values.kind === "EXPENSE"
      ? "OUTFLOW"
      : values.kind === "INCOME"
        ? "INFLOW"
        : values.direction;

  return {
    payload: {
      status: "OVERRIDDEN",
      amount,
      postedAtDate,
      accountId,
      direction,
      categoryId:
        values.kind === "ADJUSTMENT" ? null : values.categoryId.trim() || null,
      counterparty: values.counterparty.trim() || null,
      description,
      notes,
    },
  };
}

function clampDateToMonth(month: string, dayOfMonth: number): string {
  const [year, numericMonth] = month.split("-").map(Number);
  const lastDay = new Date(Date.UTC(year, numericMonth, 0)).getUTCDate();
  const day = Math.min(dayOfMonth, lastDay);
  return `${month}-${String(day).padStart(2, "0")}`;
}

function parseNumber(value: string): number | null {
  if (!value.trim()) {
    return null;
  }

  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}
