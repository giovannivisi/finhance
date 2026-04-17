import type {
  TransactionDirection,
  TransactionKind,
  TransactionResponse,
} from "@finhance/shared";

export const TRANSACTION_KIND_OPTIONS: TransactionKind[] = [
  "EXPENSE",
  "INCOME",
  "TRANSFER",
  "ADJUSTMENT",
];

export const TRANSACTION_KIND_LABELS: Record<TransactionKind, string> = {
  EXPENSE: "Expense",
  INCOME: "Income",
  TRANSFER: "Transfer",
  ADJUSTMENT: "Adjustment",
};

export const TRANSACTION_DIRECTION_OPTIONS: TransactionDirection[] = [
  "INFLOW",
  "OUTFLOW",
];

export const TRANSACTION_DIRECTION_LABELS: Record<
  TransactionDirection,
  string
> = {
  INFLOW: "Inflow",
  OUTFLOW: "Outflow",
};

export function formatTransactionAmount(
  transaction: TransactionResponse,
  formatter: (value: number, currency: string) => string,
): string {
  if (transaction.kind === "TRANSFER") {
    return formatter(transaction.amount, transaction.currency);
  }

  const prefix = transaction.direction === "INFLOW" ? "+" : "-";
  return `${prefix}${formatter(transaction.amount, transaction.currency)}`;
}
