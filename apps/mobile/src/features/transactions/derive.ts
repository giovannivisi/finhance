import type {
  AccountResponse,
  CategoryResponse,
  TransactionResponse,
} from "@finhance/shared";

import { localDateOf } from "@/lib/dates";

export interface TransactionDayGroup {
  date: string;
  items: TransactionResponse[];
}

/** Groups transactions by local posted day, newest day first. */
export function groupTransactionsByDay(
  transactions: TransactionResponse[],
): TransactionDayGroup[] {
  const groups = new Map<string, TransactionResponse[]>();

  for (const transaction of transactions) {
    const day = localDateOf(transaction.postedAt);
    const bucket = groups.get(day);

    if (bucket) {
      bucket.push(transaction);
    } else {
      groups.set(day, [transaction]);
    }
  }

  return [...groups.entries()]
    .sort(([left], [right]) => right.localeCompare(left))
    .map(([date, items]) => ({
      date,
      items: [...items].sort((a, b) => b.postedAt.localeCompare(a.postedAt)),
    }));
}

/**
 * Signed amount for display. Returns null for transfers, which are flow-neutral.
 */
export function signedTransactionAmount(
  transaction: TransactionResponse,
): number | null {
  switch (transaction.kind) {
    case "EXPENSE":
      return -transaction.amount;
    case "INCOME":
      return transaction.amount;
    case "ADJUSTMENT":
      return transaction.direction === "INFLOW"
        ? transaction.amount
        : -transaction.amount;
    case "TRANSFER":
      return null;
  }
}

export function categoryDisplayName(
  transaction: Pick<
    TransactionResponse,
    "primaryCategoryName" | "secondaryCategoryName"
  >,
): string | null {
  return (
    transaction.secondaryCategoryName ?? transaction.primaryCategoryName ?? null
  );
}

export function buildAccountNameMap(
  accounts: AccountResponse[],
): Map<string, string> {
  return new Map(accounts.map((account) => [account.id, account.name]));
}

export function transactionSubtitle(
  transaction: TransactionResponse,
  accountNames: Map<string, string>,
): string {
  if (transaction.kind === "TRANSFER") {
    const source = transaction.sourceAccountId
      ? (accountNames.get(transaction.sourceAccountId) ?? "Unknown")
      : "Unknown";
    const destination = transaction.destinationAccountId
      ? (accountNames.get(transaction.destinationAccountId) ?? "Unknown")
      : "Unknown";
    return `${source} → ${destination}`;
  }

  const parts: string[] = [];

  if (transaction.splitGroupId && transaction.fundingLegs?.length) {
    parts.push(`Split · ${transaction.fundingLegs.length} accounts`);
  } else if (transaction.accountId) {
    parts.push(accountNames.get(transaction.accountId) ?? "Unknown account");
  }

  const category = categoryDisplayName(transaction);

  if (category) {
    parts.push(category);
  } else if (transaction.kind !== "ADJUSTMENT") {
    parts.push("Uncategorised");
  }

  return parts.join(" • ");
}

export interface TransactionSearchEntry {
  transaction: TransactionResponse;
  haystack: string;
}

export function buildSearchEntries(
  transactions: TransactionResponse[],
  accountNames: Map<string, string>,
): TransactionSearchEntry[] {
  return transactions.map((transaction) => ({
    transaction,
    haystack: [
      transaction.description,
      transaction.counterparty ?? "",
      transaction.notes ?? "",
      categoryDisplayName(transaction) ?? "",
      transaction.accountId
        ? (accountNames.get(transaction.accountId) ?? "")
        : "",
    ]
      .join(" ")
      .toLowerCase(),
  }));
}

export function filterBySearch(
  entries: TransactionSearchEntry[],
  query: string,
): TransactionResponse[] {
  const needle = query.trim().toLowerCase();

  if (!needle) {
    return entries.map((entry) => entry.transaction);
  }

  const terms = needle.split(/\s+/);

  return entries
    .filter((entry) => terms.every((term) => entry.haystack.includes(term)))
    .map((entry) => entry.transaction);
}

export function activeCategoryOptions(
  categories: CategoryResponse[],
  type: "EXPENSE" | "INCOME",
): CategoryResponse[] {
  return categories
    .filter((category) => category.type === type && !category.archivedAt)
    .sort((left, right) => left.order - right.order);
}
