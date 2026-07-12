import { Injectable } from '@nestjs/common';
import { resolveAiRuntimeConfig, type AiRuntimeConfig } from '@/ai/ai.config';

@Injectable()
export class AiConfigurationService {
  get runtimeConfig(): AiRuntimeConfig {
    return resolveAiRuntimeConfig();
  }
}
