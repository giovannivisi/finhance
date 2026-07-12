import { Injectable } from '@nestjs/common';
import Groq from 'groq-sdk';
import { resolveGroqApiKey } from '@/ai/ai.config';

/**
 * Lazily constructs the provider client so deployments without a key retain the
 * deterministic parser without creating an unusable cloud client.
 */
@Injectable()
export class GroqClientProvider {
  private client: Groq | null | undefined;

  getClient(): Groq | null {
    if (this.client !== undefined) {
      return this.client;
    }

    const apiKey = resolveGroqApiKey();
    this.client = apiKey ? new Groq({ apiKey }) : null;
    return this.client;
  }
}
