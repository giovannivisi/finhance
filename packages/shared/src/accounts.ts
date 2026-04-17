export type AccountType =
  | "BANK"
  | "BROKER"
  | "CARD"
  | "CASH"
  | "LOAN"
  | "OTHER";

export interface UpsertAccountRequest {
  name: string;
  type: AccountType;
  currency?: string;
  institution?: string | null;
  notes?: string | null;
  order?: number | null;
}

export interface AccountResponse {
  id: string;
  name: string;
  type: AccountType;
  currency: string;
  institution: string | null;
  notes: string | null;
  order: number;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}
