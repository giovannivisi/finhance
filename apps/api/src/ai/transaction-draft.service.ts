import { BadRequestException, Injectable } from '@nestjs/common';
import type {
  AiTransactionDraft,
  CreateAiTransactionDraftRequest,
} from '@finhance/shared';
import { AiConfigurationService } from '@/ai/ai-configuration.service';
import { AiUsageService } from '@/ai/ai-usage.service';
import {
  AiProviderResponseError,
  GroqTransactionDraftProvider,
} from '@/ai/groq-transaction-draft.provider';
import { HeuristicTransactionDraftService } from '@/ai/heuristic-transaction-draft.service';
import { redactCloudParserText } from '@/ai/redaction';
import { hasLikelySpecialCategoryData } from '@/ai/sensitive-data';
import { validateCloudTransactionDraft } from '@/ai/transaction-draft.validation';

const ROME_DATE_FORMATTER = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Rome',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});
const DRAFT_ENDPOINT = '/ai/transaction-draft';

@Injectable()
export class TransactionDraftService {
  constructor(
    private readonly configuration: AiConfigurationService,
    private readonly usage: AiUsageService,
    private readonly heuristic: HeuristicTransactionDraftService,
    private readonly groq: GroqTransactionDraftProvider,
  ) {}

  async create(
    ownerId: string,
    input: CreateAiTransactionDraftRequest,
    now = new Date(),
  ): Promise<AiTransactionDraft> {
    const config = this.configuration.runtimeConfig;
    if (input.text.length > config.inputLimitCharacters) {
      throw new BadRequestException(
        `Transaction text must be at most ${config.inputLimitCharacters} characters.`,
      );
    }

    const heuristic = this.heuristic.create(input.text, now);

    // Receipt OCR is deliberately heuristic-only until Phase 2 sends a
    // validated candidate package rather than raw recognised text.
    if (
      input.source !== 'freeform' ||
      !config.cloudParserAvailable ||
      hasLikelySpecialCategoryData(input.text)
    ) {
      return heuristic;
    }

    const redactedText = redactCloudParserText(input.text);
    if (!redactedText.trim()) {
      return heuristic;
    }

    let reservationId: string | null = null;

    try {
      const reservation = await this.usage.reserveCloudParse(
        ownerId,
        DRAFT_ENDPOINT,
        now,
      );
      reservationId = reservation.id;

      const response = await this.groq.parse({
        text: redactedText,
        source: input.source,
        currentDate: ROME_DATE_FORMATTER.format(now),
      });
      const draft = validateCloudTransactionDraft(response.value);
      if (!draft) {
        throw new AiProviderResponseError();
      }

      await this.usage.markCompleted(
        reservation.id,
        response.inputTokens,
        response.outputTokens,
      );

      return { ...draft, parsedBy: 'groq' };
    } catch {
      if (reservationId) {
        await this.usage.markFailed(reservationId).catch(() => undefined);
      }

      return heuristic;
    }
  }
}
