import { GroqTransactionDraftProvider } from '@/ai/groq-transaction-draft.provider';

describe('GroqTransactionDraftProvider', () => {
  it('uses strict JSON schema output and disabled response storage', async () => {
    let request: unknown;
    let options: unknown;
    const create = jest.fn((nextRequest: unknown, nextOptions: unknown) => {
      request = nextRequest;
      options = nextOptions;
      return Promise.resolve({
        choices: [{ message: { content: '{"description":"Pizza"}' } }],
        usage: { prompt_tokens: 12, completion_tokens: 8 },
      });
    });
    const clientProvider = {
      getClient: jest.fn().mockReturnValue({
        chat: { completions: { create } },
      }),
    };
    const configuration = {
      runtimeConfig: {
        model: 'openai/gpt-oss-20b',
        outputLimitTokens: 1_024,
        timeoutMs: 15_000,
      },
    };
    const provider = new GroqTransactionDraftProvider(
      clientProvider as unknown as ConstructorParameters<
        typeof GroqTransactionDraftProvider
      >[0],
      configuration as ConstructorParameters<
        typeof GroqTransactionDraftProvider
      >[1],
    );

    await expect(
      provider.parse({
        text: '14.50 pizza yesterday amex',
        source: 'freeform',
        currentDate: '2026-07-12',
      }),
    ).resolves.toEqual({
      value: { description: 'Pizza' },
      inputTokens: 12,
      outputTokens: 8,
    });
    expect(request).toMatchObject({
      model: 'openai/gpt-oss-20b',
      store: false,
      stream: false,
      response_format: {
        type: 'json_schema',
        json_schema: { strict: true },
      },
    });
    expect(options).toEqual({ timeout: 15_000 });
  });
});
