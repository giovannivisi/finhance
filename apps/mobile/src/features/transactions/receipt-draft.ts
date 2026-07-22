import type { AiTransactionDraft } from "@finhance/shared";
import { createHeuristicTransactionDraft } from "@finhance/shared/transaction-draft-parser";

import { deleteTemporaryReceiptImage } from "@/features/transactions/receipt-image";
import { recogniseReceiptText } from "@/features/transactions/receipt-ocr";
import { prepareReceiptDraftText } from "@/features/transactions/receipt-redaction";

export class EmptyReceiptTextError extends Error {
  constructor() {
    super("No readable receipt text was found.");
    this.name = "EmptyReceiptTextError";
  }
}

export class ReceiptImageCleanupError extends Error {
  constructor() {
    super("The temporary receipt image could not be removed.");
    this.name = "ReceiptImageCleanupError";
  }
}

/**
 * Recognises and parses a receipt locally, then removes the private cache copy
 * before returning any derived draft fields to the caller.
 */
export async function createReceiptDraftFromImage(
  imageUri: string,
  now = new Date(),
): Promise<AiTransactionDraft> {
  try {
    const recognisedText = await recogniseReceiptText(imageUri);
    const draftText = prepareReceiptDraftText(recognisedText);

    if (!draftText) {
      throw new EmptyReceiptTextError();
    }

    return createReceiptDraft(draftText, now);
  } finally {
    try {
      deleteTemporaryReceiptImage(imageUri);
    } catch {
      throw new ReceiptImageCleanupError();
    }
  }
}

export function createReceiptDraft(
  text: string,
  now = new Date(),
): AiTransactionDraft {
  return createHeuristicTransactionDraft(text, now);
}
