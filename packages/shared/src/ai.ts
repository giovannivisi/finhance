export type AiTransactionDraftSource = "freeform" | "receipt";

export type AiTransactionDraftParser = "heuristic" | "groq";

export type AiTransactionDraftPaymentMethod = "cash" | "card" | "unknown";

export interface CreateAiTransactionDraftRequest {
  text: string;
  source: AiTransactionDraftSource;
}

/** A suggestion only; clients must map it into an editable transaction form. */
export interface AiTransactionDraft {
  amount: number | null;
  currency: string | null;
  postedAt: string | null;
  description: string;
  counterparty: string | null;
  paymentMethod: AiTransactionDraftPaymentMethod;
  cardLast4: string | null;
  parsedBy: AiTransactionDraftParser;
}
