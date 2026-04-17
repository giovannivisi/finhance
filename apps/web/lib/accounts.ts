import type { AccountResponse, AccountType } from "@finhance/shared";

export const ACCOUNT_TYPE_OPTIONS: AccountType[] = [
  "BANK",
  "BROKER",
  "CARD",
  "CASH",
  "LOAN",
  "OTHER",
];

export const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  BANK: "Bank",
  BROKER: "Broker",
  CARD: "Card",
  CASH: "Cash",
  LOAN: "Loan",
  OTHER: "Other",
};

export function formatAccountOptionLabel(account: AccountResponse): string {
  return `${account.name} (${ACCOUNT_TYPE_LABELS[account.type]}${account.archivedAt ? ", Archived" : ""})`;
}
