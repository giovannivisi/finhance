import { Module } from '@nestjs/common';
import { AiConfigurationService } from '@/ai/ai-configuration.service';
import { AiUsageService } from '@/ai/ai-usage.service';
import { GroqClientProvider } from '@/ai/groq-client.provider';

@Module({
  providers: [AiConfigurationService, AiUsageService, GroqClientProvider],
  exports: [AiConfigurationService, AiUsageService, GroqClientProvider],
})
export class AiModule {}
