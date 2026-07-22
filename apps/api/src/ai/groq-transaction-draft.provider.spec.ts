import { GroqTransactionDraftProvider } from '@/ai/groq-transaction-draft.provider';

type GroqRequestSpy = {
  model: string;
  store: boolean;
  stream: boolean;
  response_format: {
    type: string;
    json_schema: {
      strict: boolean;
      schema: { required: readonly string[] };
    };
  };
};

describe('GroqTransactionDraftProvider', () => {
  it('uses strict JSON schema output and disabled response storage', async () => {
    const create = jest.fn((request: GroqRequestSpy, options: unknown) => {
      void request;
      void options;
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
    const [request, options] = create.mock.calls[0] ?? [];
    if (!request) {
      throw new Error('Expected Groq provider request.');
    }

    expect(request).toMatchObject({
      model: 'openai/gpt-oss-20b',
      store: false,
      stream: false,
      response_format: {
        type: 'json_schema',
        json_schema: { strict: true },
      },
    });
    expect(request.response_format.json_schema.schema.required).toContain(
      'kind',
    );
    expect(options).toEqual({ timeout: 15_000 });
  });
});
