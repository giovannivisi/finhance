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
    if (
      transaction.sourceAmount !== null &&
      transaction.sourceAmount !== undefined &&
      transaction.destinationAmount !== null &&
      transaction.destinationAmount !== undefined &&
      transaction.sourceCurrency &&
      transaction.destinationCurrency &&
      (transaction.sourceCurrency !== transaction.destinationCurrency ||
        transaction.sourceAmount !== transaction.destinationAmount)
    ) {
      return `${formatter(
        transaction.sourceAmount,
        transaction.sourceCurrency,
      )} -> ${formatter(
        transaction.destinationAmount,
        transaction.destinationCurrency,
      )}`;
    }

    return formatter(
      transaction.sourceAmount ?? transaction.amount,
      transaction.sourceCurrency ?? transaction.currency,
    );
  }

  const prefix = transaction.direction === "INFLOW" ? "+" : "-";
  if (
    transaction.nativeAmount !== null &&
    transaction.nativeAmount !== undefined &&
    transaction.nativeCurrency &&
    transaction.nativeCurrency !== transaction.currency
  ) {
    return `${prefix}${formatter(
      transaction.nativeAmount,
      transaction.nativeCurrency,
    )} (${formatter(transaction.amount, transaction.currency)})`;
  }

  return `${prefix}${formatter(transaction.amount, transaction.currency)}`;
}
