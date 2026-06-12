import type {
  AccountResponse,
  ExpenseValidationRuleResponse,
  TransactionDirection,
  TransactionKind,
  TransactionResponse,
  UpsertTransactionRequest,
} from "@finhance/shared";

import { localDateOf, todayLocalDate } from "@/lib/dates";
import { parseAmountInput } from "@/lib/money";

export interface FundingLegDraft {
  accountId: string | null;
  amount: string;
}

export interface TransactionFormState {
  kind: TransactionKind;
  date: string;
  /** HH:mm, preserved from the edited row or the creation moment. */
  time: string;
  amount: string;
  description: string;
  notes: string;
  counterparty: string;
  accountId: string | null;
  categoryId: string | null;
  direction: TransactionDirection;
  split: boolean;
  legs: FundingLegDraft[];
  sourceAccountId: string | null;
  destinationAccountId: string | null;
  destinationAmount: string;
  fxRate: string;
  nativeEnabled: boolean;
  nativeCurrency: string;
  nativeAmount: string;
}

export type TransactionFormErrors = Partial<
  Record<
    | "amount"
    | "description"
    | "accountId"
    | "categoryId"
    | "sourceAccountId"
    | "destinationAccountId"
    | "destinationAmount"
    | "fxRate"
    | "legs"
    | "nativeAmount"
    | "nativeCurrency",
    string
  >
>;

function nowTime(): string {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, "0")}:${String(
    now.getMinutes(),
  ).padStart(2, "0")}`;
}

export function emptyTransactionForm(): TransactionFormState {
  return {
    kind: "EXPENSE",
    date: todayLocalDate(),
    time: nowTime(),
    amount: "",
    description: "",
    notes: "",
    counterparty: "",
    accountId: null,
    categoryId: null,
    direction: "OUTFLOW",
    split: false,
    legs: [
      { accountId: null, amount: "" },
      { accountId: null, amount: "" },
    ],
    sourceAccountId: null,
    destinationAccountId: null,
    destinationAmount: "",
    fxRate: "",
    nativeEnabled: false,
    nativeCurrency: "",
    nativeAmount: "",
  };
}

function timeOf(isoTimestamp: string): string {
  const date = new Date(isoTimestamp);

  if (Number.isNaN(date.getTime())) {
    return nowTime();
  }

  return `${String(date.getHours()).padStart(2, "0")}:${String(
    date.getMinutes(),
  ).padStart(2, "0")}`;
}

function amountToInput(value: number | null | undefined): string {
  if (value === null || value === undefined) {
    return "";
  }

  return `${value}`;
}

export function formFromTransaction(
  transaction: TransactionResponse,
): TransactionFormState {
  const base = emptyTransactionForm();
  const isSplit = Boolean(
    transaction.splitGroupId && transaction.fundingLegs?.length,
  );

  return {
    ...base,
    kind: transaction.kind,
    date: localDateOf(transaction.postedAt),
    time: timeOf(transaction.postedAt),
    amount: amountToInput(transaction.amount),
    description: transaction.description,
    notes: transaction.notes ?? "",
    counterparty: transaction.counterparty ?? "",
    accountId: transaction.accountId,
    categoryId: transaction.categoryId,
    direction: transaction.direction ?? "OUTFLOW",
    split: isSplit,
    legs: isSplit
      ? (transaction.fundingLegs ?? []).map((leg) => ({
          accountId: leg.accountId,
          amount: amountToInput(leg.amount),
        }))
      : base.legs,
    sourceAccountId: transaction.sourceAccountId,
    destinationAccountId: transaction.destinationAccountId,
    destinationAmount: amountToInput(transaction.destinationAmount ?? null),
    fxRate:
      transaction.fxRateSource === "MANUAL"
        ? amountToInput(transaction.fxRateUsed ?? null)
        : "",
    nativeEnabled: Boolean(transaction.nativeCurrency),
    nativeCurrency: transaction.nativeCurrency ?? "",
    nativeAmount: amountToInput(transaction.nativeAmount ?? null),
  };
}

export function buildPostedAt(date: string, time: string): string {
  const [year, month, day] = date.split("-").map(Number);
  const [hours, minutes] = time.split(":").map(Number);
  const result = new Date(
    year ?? 1970,
    (month ?? 1) - 1,
    day ?? 1,
    hours ?? 12,
    minutes ?? 0,
  );
  return result.toISOString();
}

/** Finds the expense category implied by description validation rules. */
export function matchExpenseRule(
  description: string,
  rules: ExpenseValidationRuleResponse[],
): ExpenseValidationRuleResponse | null {
  const normalized = description.trim().toLocaleLowerCase("en-US");

  if (!normalized) {
    return null;
  }

  return rules.find((rule) => rule.normalizedEntry === normalized) ?? null;
}

export interface BuildRequestResult {
  request?: UpsertTransactionRequest;
  errors: TransactionFormErrors;
}

export function buildTransactionRequest(
  state: TransactionFormState,
  accountsById: Map<string, AccountResponse>,
  expenseRules: ExpenseValidationRuleResponse[],
): BuildRequestResult {
  const errors: TransactionFormErrors = {};
  const description = state.description.trim();

  if (!description) {
    errors.description = "A description is required.";
  }

  const postedAt = buildPostedAt(state.date, state.time);
  const notes = state.notes.trim() || null;

  if (state.kind === "TRANSFER") {
    if (!state.sourceAccountId) {
      errors.sourceAccountId = "Pick the account money left.";
    }

    if (!state.destinationAccountId) {
      errors.destinationAccountId = "Pick the account money entered.";
    }

    if (
      state.sourceAccountId &&
      state.destinationAccountId &&
      state.sourceAccountId === state.destinationAccountId
    ) {
      errors.destinationAccountId = "Use two different accounts.";
    }

    const amount = parseAmountInput(state.amount);

    if (amount === null || amount <= 0) {
      errors.amount = "Enter a positive amount.";
    }

    const sourceCurrency = state.sourceAccountId
      ? accountsById.get(state.sourceAccountId)?.currency
      : undefined;
    const destinationCurrency = state.destinationAccountId
      ? accountsById.get(state.destinationAccountId)?.currency
      : undefined;
    const crossCurrency =
      sourceCurrency &&
      destinationCurrency &&
      sourceCurrency !== destinationCurrency;

    let destinationAmount: number | null = null;
    let fxRate: number | null = null;

    if (crossCurrency) {
      if (state.destinationAmount.trim()) {
        destinationAmount = parseAmountInput(state.destinationAmount);

        if (destinationAmount === null || destinationAmount <= 0) {
          errors.destinationAmount = "Enter a positive amount.";
        }
      }

      if (state.fxRate.trim()) {
        fxRate = parseAmountInput(state.fxRate);

        if (fxRate === null || fxRate <= 0) {
          errors.fxRate = "Enter a positive rate.";
        }
      }

      if (destinationAmount !== null && fxRate === null && amount) {
        // Let the API treat the implied rate as a manual override so the
        // destination amount is honoured exactly.
        fxRate = destinationAmount / amount;
      }
    }

    if (Object.keys(errors).length > 0) {
      return { errors };
    }

    return {
      errors,
      request: {
        kind: "TRANSFER",
        postedAt,
        amount: amount as number,
        description,
        notes,
        sourceAccountId: state.sourceAccountId as string,
        destinationAccountId: state.destinationAccountId as string,
        destinationAmount,
        fxRateUsed: fxRate,
        fxRateSource: fxRate !== null ? "MANUAL" : null,
      },
    };
  }

  if (state.kind === "EXPENSE" && state.split) {
    const legs = state.legs
      .map((leg) => ({
        accountId: leg.accountId,
        amount: parseAmountInput(leg.amount),
      }))
      .filter((leg) => leg.accountId || leg.amount !== null);

    if (legs.length < 2) {
      errors.legs = "A split needs at least two funding accounts.";
    } else if (
      legs.some(
        (leg) => !leg.accountId || leg.amount === null || leg.amount <= 0,
      )
    ) {
      errors.legs = "Every leg needs an account and a positive amount.";
    } else {
      const accountIds = new Set(legs.map((leg) => leg.accountId));

      if (accountIds.size !== legs.length) {
        errors.legs = "Each leg must use a different account.";
      }

      const currencies = new Set(
        legs.map(
          (leg) => accountsById.get(leg.accountId as string)?.currency ?? "?",
        ),
      );

      if (currencies.size > 1) {
        errors.legs = "Split legs must share one currency.";
      }
    }

    const categoryId = state.categoryId;

    if (!categoryId) {
      errors.categoryId = "Splits need an explicit category.";
    }

    if (Object.keys(errors).length > 0) {
      return { errors };
    }

    const totalAmount = legs.reduce(
      (sum, leg) => sum + (leg.amount as number),
      0,
    );

    return {
      errors,
      request: {
        kind: "EXPENSE",
        postedAt,
        amount: Number(totalAmount.toFixed(2)),
        description,
        notes,
        categoryId: categoryId as string,
        counterparty: state.counterparty.trim() || null,
        fundingLegs: legs.map((leg) => ({
          accountId: leg.accountId as string,
          amount: leg.amount as number,
        })),
      },
    };
  }

  // Standard expense / income / adjustment.
  const amount = parseAmountInput(state.amount);

  if (amount === null || amount <= 0) {
    errors.amount = "Enter a positive amount.";
  }

  if (!state.accountId) {
    errors.accountId = "Pick an account.";
  }

  let categoryId = state.categoryId;

  if (state.kind === "EXPENSE" && !categoryId) {
    categoryId =
      matchExpenseRule(description, expenseRules)?.secondaryCategoryId ?? null;

    if (!categoryId) {
      errors.categoryId = "Pick a category.";
    }
  }

  if (state.kind === "INCOME" && !categoryId) {
    errors.categoryId = "Pick a category.";
  }

  if (state.kind === "ADJUSTMENT") {
    categoryId = null;
  }

  const account = state.accountId ? accountsById.get(state.accountId) : null;
  let nativeAmount: number | null = null;
  let nativeCurrency: string | null = null;

  if (state.nativeEnabled) {
    nativeCurrency = state.nativeCurrency.trim().toUpperCase() || null;

    if (!nativeCurrency || !/^[A-Z]{3}$/.test(nativeCurrency)) {
      errors.nativeCurrency = "Use a 3-letter currency code.";
    } else if (account && nativeCurrency === account.currency) {
      nativeCurrency = null;
    }

    if (nativeCurrency) {
      nativeAmount = parseAmountInput(state.nativeAmount);

      if (nativeAmount === null || nativeAmount <= 0) {
        errors.nativeAmount = "Enter the original amount.";
      }
    }
  }

  if (Object.keys(errors).length > 0) {
    return { errors };
  }

  const direction: TransactionDirection =
    state.kind === "EXPENSE"
      ? "OUTFLOW"
      : state.kind === "INCOME"
        ? "INFLOW"
        : state.direction;

  return {
    errors,
    request: {
      kind: state.kind,
      postedAt,
      amount: amount as number,
      description,
      notes,
      accountId: state.accountId as string,
      direction,
      categoryId,
      counterparty: state.counterparty.trim() || null,
      nativeAmount: nativeCurrency ? nativeAmount : null,
      nativeCurrency,
    },
  };
}
