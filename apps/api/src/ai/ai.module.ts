import { Module } from '@nestjs/common';
import { AiConfigurationService } from '@/ai/ai-configuration.service';
import { AiController } from '@/ai/ai.controller';
import { AiUsageService } from '@/ai/ai-usage.service';
import { GroqClientProvider } from '@/ai/groq-client.provider';
import { GroqTransactionDraftProvider } from '@/ai/groq-transaction-draft.provider';
import { HeuristicTransactionDraftService } from '@/ai/heuristic-transaction-draft.service';
import { RequestOwnerResolver } from '@/security/request-owner.resolver';
import { TransactionDraftService } from '@/ai/transaction-draft.service';

@Module({
  controllers: [AiController],
  providers: [
    AiConfigurationService,
    AiUsageService,
    GroqClientProvider,
    GroqTransactionDraftProvider,
    HeuristicTransactionDraftService,
    RequestOwnerResolver,
    TransactionDraftService,
  ],
  exports: [
    AiConfigurationService,
    AiUsageService,
    GroqClientProvider,
    TransactionDraftService,
  ],
})
export class AiModule {}
