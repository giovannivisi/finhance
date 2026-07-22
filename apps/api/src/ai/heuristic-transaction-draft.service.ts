import { Injectable } from '@nestjs/common';
import type { AiTransactionDraft } from '@finhance/shared';
import { createHeuristicTransactionDraft } from '@finhance/shared/transaction-draft-parser';
import { redactCloudParserText } from '@/ai/redaction';

@Injectable()
export class HeuristicTransactionDraftService {
  create(text: string, now = new Date()): AiTransactionDraft {
    const redactedText = redactCloudParserText(text);

    return createHeuristicTransactionDraft(redactedText, now);
  }
}
