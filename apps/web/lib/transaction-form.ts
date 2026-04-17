import type {
  TransactionDirection,
  TransactionKind,
  TransactionResponse,
  UpsertTransactionRequest,
} from "@finhance/shared";

export interface TransactionFormValues {
  postedAt: string;
  kind: TransactionKind;
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

const DEFAULT_TRANSACTION_KIND: TransactionKind = "EXPENSE";
const DEFAULT_TRANSACTION_DIRECTION: TransactionDirection = "OUTFLOW";

export function createEmptyTransactionFormValues(): TransactionFormValues {
  return {
    postedAt: toDateTimeLocalValue(new Date().toISOString()),
    kind: DEFAULT_TRANSACTION_KIND,
    amount: "",
    description: "",
    notes: "",
    accountId: "",
    direction: DEFAULT_TRANSACTION_DIRECTION,
    categoryId: "",
    counterparty: "",
    sourceAccountId: "",
    destinationAccountId: "",
  };
}

export function transactionToFormValues(
  transaction: TransactionResponse,
): TransactionFormValues {
  return {
    postedAt: toDateTimeLocalValue(transaction.postedAt),
    kind: transaction.kind,
    amount: String(transaction.amount),
    description: transaction.description,
    notes: transaction.notes ?? "",
    accountId: transaction.accountId ?? "",
    direction: transaction.direction ?? DEFAULT_TRANSACTION_DIRECTION,
    categoryId: transaction.categoryId ?? "",
    counterparty: transaction.counterparty ?? "",
    sourceAccountId: transaction.sourceAccountId ?? "",
    destinationAccountId: transaction.destinationAccountId ?? "",
  };
}

export function buildTransactionPayload(values: TransactionFormValues): {
  payload?: UpsertTransactionRequest;
  error?: string;
} {
  const postedAt = parsePostedAt(values.postedAt);
  const amount = parseNumber(values.amount);
  const description = values.description.trim();
  const notes = values.notes.trim() || null;

  if (!postedAt) {
    return { error: "Please enter a valid posting date and time." };
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
        postedAt,
        kind: "TRANSFER",
        amount,
        description,
        notes,
        sourceAccountId,
        destinationAccountId,
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
  const categoryId =
    values.kind === "ADJUSTMENT" ? null : values.categoryId.trim() || null;

  if (values.kind === "ADJUSTMENT" && !direction) {
    return { error: "Adjustments require a direction." };
  }

  return {
    payload: {
      postedAt,
      kind: values.kind,
      amount,
      description,
      notes,
      accountId,
      direction,
      categoryId,
      counterparty: values.counterparty.trim() || null,
    },
  };
}

export function toDateTimeLocalValue(isoString: string): string {
  const date = new Date(isoString);
  const localDate = new Date(
    date.getTime() - date.getTimezoneOffset() * 60_000,
  );
  return localDate.toISOString().slice(0, 16);
}

function parsePostedAt(value: string): string | null {
  if (!value.trim()) {
    return null;
  }

  const postedAt = new Date(value);
  if (Number.isNaN(postedAt.getTime())) {
    return null;
  }

  return postedAt.toISOString();
}

function parseNumber(value: string): number | null {
  if (!value.trim()) {
    return null;
  }

  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}
