import { BadRequestException, Logger } from '@nestjs/common';
import type { AiRuntimeConfig } from '@/ai/ai.config';
import { HeuristicTransactionDraftService } from '@/ai/heuristic-transaction-draft.service';
import { TransactionDraftService } from '@/ai/transaction-draft.service';

const runtimeConfig: AiRuntimeConfig = {
  cloudParserAvailable: true,
  dailyLimitGlobal: 100,
  dailyLimitPerUser: 10,
  disabled: false,
  inputLimitCharacters: 6_000,
  model: 'openai/gpt-oss-20b',
  outputLimitTokens: 1_024,
  rateLimitPerMinute: 3,
  timeoutMs: 15_000,
};

describe('TransactionDraftService', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  function createService(overrides?: {
    config?: Partial<AiRuntimeConfig>;
    providerResult?: unknown;
  }) {
    const usage = {
      reserveCloudParse: jest.fn().mockResolvedValue({
        id: 'usage-1',
        model: runtimeConfig.model,
      }),
      markCompleted: jest.fn().mockResolvedValue(undefined),
      markFailed: jest.fn().mockResolvedValue(undefined),
    };
    const groq = {
      parse: jest.fn().mockResolvedValue({
        value: overrides?.providerResult ?? {
          kind: 'EXPENSE',
          amount: 14.5,
          currency: 'EUR',
          postedAt: '2026-07-11',
          description: 'Pizza',
          counterparty: null,
          paymentMethod: 'card',
          cardLast4: null,
        },
        inputTokens: 100,
        outputTokens: 50,
      }),
    };
    const configuration = {
      runtimeConfig: { ...runtimeConfig, ...overrides?.config },
    };
    const service = new TransactionDraftService(
      configuration as ConstructorParameters<typeof TransactionDraftService>[0],
      usage as unknown as ConstructorParameters<
        typeof TransactionDraftService
      >[1],
      new HeuristicTransactionDraftService(),
      groq as unknown as ConstructorParameters<
        typeof TransactionDraftService
      >[3],
    );

    return { service, usage, groq };
  }

  it('uses the cloud result only after a reservation and semantic validation', async () => {
    const { service, usage, groq } = createService();

    await expect(
      service.create(
        'user-1',
        { text: '14.50 pizza yesterday amex', source: 'freeform' },
        new Date('2026-07-12T12:00:00.000Z'),
      ),
    ).resolves.toMatchObject({
      parsedBy: 'groq',
      cloudAttempted: true,
      description: 'Pizza',
      postedAt: '2026-07-11',
    });
    expect(groq.parse).toHaveBeenCalledWith({
      text: '14.50 pizza yesterday amex',
      source: 'freeform',
      currentDate: '2026-07-12',
    });
    expect(usage.markCompleted).toHaveBeenCalledWith('usage-1', 100, 50);
  });

  it('returns a heuristic draft without contacting Groq when cloud parsing is unavailable', async () => {
    const { service, usage, groq } = createService({
      config: { cloudParserAvailable: false },
    });

    await expect(
      service.create('user-1', {
        text: '14.50 pizza yesterday amex',
        source: 'freeform',
      }),
    ).resolves.toMatchObject({
      parsedBy: 'heuristic',
      cloudAttempted: false,
      amount: 14.5,
    });
    expect(usage.reserveCloudParse).not.toHaveBeenCalled();
    expect(groq.parse).not.toHaveBeenCalled();
  });

  it('uses the heuristic path for likely special-category text', async () => {
    const { service, usage, groq } = createService();

    await expect(
      service.create('user-1', {
        text: '35 EUR therapy appointment yesterday',
        source: 'freeform',
      }),
    ).resolves.toMatchObject({
      parsedBy: 'heuristic',
      cloudAttempted: false,
    });
    expect(usage.reserveCloudParse).not.toHaveBeenCalled();
    expect(groq.parse).not.toHaveBeenCalled();
  });

  it('redacts direct identifiers before a freeform draft reaches Groq', async () => {
    const { service, groq } = createService();

    await service.create('user-1', {
      text: '14.50 pizza paid with 4111 1111 1111 1111',
      source: 'freeform',
    });

    expect(groq.parse).toHaveBeenCalledWith(
      expect.objectContaining({
        text: '14.50 pizza paid with •••• 1111',
      }),
    );
  });

  it('does not send receipt text to the cloud before the Phase 2 candidate package exists', async () => {
    const { service, usage, groq } = createService();

    await expect(
      service.create('user-1', {
        text: 'Total EUR 14.50',
        source: 'receipt',
      }),
    ).resolves.toMatchObject({
      parsedBy: 'heuristic',
      cloudAttempted: false,
    });
    expect(usage.reserveCloudParse).not.toHaveBeenCalled();
    expect(groq.parse).not.toHaveBeenCalled();
  });

  it('falls back and marks usage failed when the provider result is malformed', async () => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    const { service, usage } = createService({
      providerResult: { description: 'Pizza' },
    });

    await expect(
      service.create('user-1', {
        text: '14.50 pizza yesterday amex',
        source: 'freeform',
      }),
    ).resolves.toMatchObject({
      parsedBy: 'heuristic',
      cloudAttempted: true,
      description: 'pizza',
    });
    expect(usage.markFailed).toHaveBeenCalledWith('usage-1');
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('Cloud transaction draft failed'),
    );
    expect(warn.mock.calls.join(' ')).not.toContain(
      '14.50 pizza yesterday amex',
    );
  });

  it('enforces the configured input cap before attempting any parser', async () => {
    const { service, usage, groq } = createService({
      config: { inputLimitCharacters: 4 },
    });

    await expect(
      service.create('user-1', { text: 'pizza', source: 'freeform' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(usage.reserveCloudParse).not.toHaveBeenCalled();
    expect(groq.parse).not.toHaveBeenCalled();
  });
});
