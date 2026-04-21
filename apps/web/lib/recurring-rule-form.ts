import type {
  RecurringTransactionRuleResponse,
  TransactionDirection,
  TransactionKind,
  UpsertRecurringTransactionRuleRequest,
} from "@finhance/shared";

export interface RecurringRuleFormValues {
  name: string;
  kind: TransactionKind;
  amount: string;
  dayOfMonth: string;
  startDate: string;
  endDate: string;
  accountId: string;
  direction: TransactionDirection;
  categoryId: string;
  counterparty: string;
  sourceAccountId: string;
  destinationAccountId: string;
  description: string;
  notes: string;
  isActive: boolean;
}

const DEFAULT_KIND: TransactionKind = "EXPENSE";
const DEFAULT_DIRECTION: TransactionDirection = "OUTFLOW";

function todayDateValue(): string {
  return new Date().toISOString().slice(0, 10);
}

export function createEmptyRecurringRuleFormValues(): RecurringRuleFormValues {
  return {
    name: "",
    kind: DEFAULT_KIND,
    amount: "",
    dayOfMonth: String(new Date().getDate()),
    startDate: todayDateValue(),
    endDate: "",
    accountId: "",
    direction: DEFAULT_DIRECTION,
    categoryId: "",
    counterparty: "",
    sourceAccountId: "",
    destinationAccountId: "",
    description: "",
    notes: "",
    isActive: true,
  };
}

export function recurringRuleToFormValues(
  rule: RecurringTransactionRuleResponse,
): RecurringRuleFormValues {
  return {
    name: rule.name,
    kind: rule.kind,
    amount: String(rule.amount),
    dayOfMonth: String(rule.dayOfMonth),
    startDate: rule.startDate,
    endDate: rule.endDate ?? "",
    accountId: rule.accountId ?? "",
    direction: rule.direction ?? DEFAULT_DIRECTION,
    categoryId: rule.categoryId ?? "",
    counterparty: rule.counterparty ?? "",
    sourceAccountId: rule.sourceAccountId ?? "",
    destinationAccountId: rule.destinationAccountId ?? "",
    description: rule.description,
    notes: rule.notes ?? "",
    isActive: rule.isActive,
  };
}

export function buildRecurringRulePayload(values: RecurringRuleFormValues): {
  payload?: UpsertRecurringTransactionRuleRequest;
  error?: string;
} {
  const name = values.name.trim();
  const description = values.description.trim();
  const notes = values.notes.trim() || null;
  const amount = parseNumber(values.amount);
  const dayOfMonth = parseInteger(values.dayOfMonth);
  const startDate = values.startDate.trim();
  const endDate = values.endDate.trim() || null;

  if (!name) {
    return { error: "Name is required." };
  }

  if (!description) {
    return { error: "Description is required." };
  }

  if (amount === null || amount <= 0) {
    return { error: "Please enter a positive amount." };
  }

  if (dayOfMonth === null || dayOfMonth < 1 || dayOfMonth > 31) {
    return { error: "Day of month must be between 1 and 31." };
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
    return { error: "Start date is required." };
  }

  if (endDate && !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
    return { error: "End date must use YYYY-MM-DD." };
  }

  if (endDate && endDate < startDate) {
    return { error: "End date must be on or after the start date." };
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
        name,
        kind: "TRANSFER",
        amount,
        dayOfMonth,
        startDate,
        endDate,
        sourceAccountId,
        destinationAccountId,
        description,
        notes,
        isActive: values.isActive,
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
      name,
      kind: values.kind,
      amount,
      dayOfMonth,
      startDate,
      endDate,
      accountId,
      direction,
      categoryId:
        values.kind === "ADJUSTMENT" ? null : values.categoryId.trim() || null,
      counterparty: values.counterparty.trim() || null,
      description,
      notes,
      isActive: values.isActive,
    },
  };
}

function parseNumber(value: string): number | null {
  if (!value.trim()) {
    return null;
  }

  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function parseInteger(value: string): number | null {
  if (!value.trim()) {
    return null;
  }

  const numeric = Number.parseInt(value, 10);
  return Number.isFinite(numeric) ? numeric : null;
}
