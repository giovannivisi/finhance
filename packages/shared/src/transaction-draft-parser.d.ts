import type { AiTransactionDraft } from "#ai";

/** Derives a conservative, reviewable transaction draft from redacted text. */
export declare function createHeuristicTransactionDraft(
  text: string,
  now?: Date,
): AiTransactionDraft;
