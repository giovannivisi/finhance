import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import type {
  AiTransactionDraft,
  CreateAiTransactionDraftRequest,
} from '@finhance/shared';
import { AiConfigurationService } from '@/ai/ai-configuration.service';
import {
  AiCloudParserNotEligibleError,
  AiCloudParserUnavailableError,
  AiDailyLimitExceededError,
  AiUsageService,
} from '@/ai/ai-usage.service';
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
  private readonly logger = new Logger(TransactionDraftService.name);

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

    // Receipt-origin drafts remain heuristic-only for compatibility with older
    // clients and are never sent to the cloud parser. Current mobile clients
    // derive receipt drafts entirely on-device.
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
    let cloudAttempted = false;

    try {
      const reservation = await this.usage.reserveCloudParse(
        ownerId,
        DRAFT_ENDPOINT,
        now,
      );
      reservationId = reservation.id;

      cloudAttempted = true;
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

      return { ...draft, parsedBy: 'groq', cloudAttempted: true };
    } catch (error) {
      if (shouldLogCloudFailure(error)) {
        this.logger.warn(
          `Cloud transaction draft failed (${errorName(error)}; attempted=${cloudAttempted}; reservation=${reservationId ? 'present' : 'absent'}).`,
        );
      }

      if (reservationId) {
        await this.usage.markFailed(reservationId).catch((markFailedError) => {
          this.logger.warn(
            `Could not mark cloud transaction draft usage as failed (${errorName(markFailedError)}).`,
          );
        });
      }

      return { ...heuristic, cloudAttempted };
    }
  }
}

function shouldLogCloudFailure(error: unknown): boolean {
  return !(
    error instanceof AiCloudParserNotEligibleError ||
    error instanceof AiCloudParserUnavailableError ||
    error instanceof AiDailyLimitExceededError
  );
}

function errorName(error: unknown): string {
  return error instanceof Error && error.name ? error.name : 'UnknownError';
}
