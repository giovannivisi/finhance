import {
  AiUsageEventStatus,
  CloudParserConsentAction,
  Prisma,
} from '@finhance/db';
import {
  AI_CLOUD_PARSER_CONSENT_VERSION,
  AI_CLOUD_PARSER_PROVIDER,
  type AiRuntimeConfig,
} from '@/ai/ai.config';
import {
  AiCloudParserUnavailableError,
  AiDailyLimitExceededError,
  AiUsageService,
} from '@/ai/ai-usage.service';

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

describe('AiUsageService', () => {
  it('reserves quota in a serializable transaction', async () => {
    const transactionClient = {
      aiUsageEvent: {
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn().mockResolvedValue({
          id: 'usage-1',
          model: runtimeConfig.model,
        }),
      },
    };
    const prisma = {
      $transaction: jest.fn(
        (
          callback: (tx: typeof transactionClient) => Promise<unknown>,
        ): Promise<unknown> => callback(transactionClient),
      ),
    };
    const configuration = { runtimeConfig };
    const service = new AiUsageService(
      prisma as unknown as ConstructorParameters<typeof AiUsageService>[0],
      configuration as ConstructorParameters<typeof AiUsageService>[1],
    );

    await expect(
      service.reserveCloudParse(
        'user-1',
        '/ai/transaction-draft',
        new Date('2026-07-12T12:00:00.000Z'),
      ),
    ).resolves.toEqual({ id: 'usage-1', model: runtimeConfig.model });

    expect(transactionClient.aiUsageEvent.create).toHaveBeenCalledWith({
      data: {
        endpoint: '/ai/transaction-draft',
        model: runtimeConfig.model,
        provider: AI_CLOUD_PARSER_PROVIDER,
        status: AiUsageEventStatus.RESERVED,
        userId: 'user-1',
      },
      select: { id: true, model: true },
    });
    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    });
  });

  it('fails closed before writing usage when the provider is unavailable', async () => {
    const prisma = { $transaction: jest.fn() };
    const configuration = {
      runtimeConfig: { ...runtimeConfig, cloudParserAvailable: false },
    };
    const service = new AiUsageService(
      prisma as unknown as ConstructorParameters<typeof AiUsageService>[0],
      configuration as ConstructorParameters<typeof AiUsageService>[1],
    );

    await expect(
      service.reserveCloudParse('user-1', '/ai/transaction-draft'),
    ).rejects.toBeInstanceOf(AiCloudParserUnavailableError);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('refuses a reservation that would exceed the user daily limit', async () => {
    const transactionClient = {
      aiUsageEvent: {
        count: jest
          .fn()
          .mockResolvedValueOnce(runtimeConfig.dailyLimitPerUser)
          .mockResolvedValueOnce(0),
        create: jest.fn(),
      },
    };
    const prisma = {
      $transaction: jest.fn(
        (
          callback: (tx: typeof transactionClient) => Promise<unknown>,
        ): Promise<unknown> => callback(transactionClient),
      ),
    };
    const service = new AiUsageService(
      prisma as unknown as ConstructorParameters<typeof AiUsageService>[0],
      { runtimeConfig } as ConstructorParameters<typeof AiUsageService>[1],
    );

    await expect(
      service.reserveCloudParse('user-1', '/ai/transaction-draft'),
    ).rejects.toEqual(new AiDailyLimitExceededError('user'));
    expect(transactionClient.aiUsageEvent.create).not.toHaveBeenCalled();
  });

  it('only treats the current granted notice as active consent', async () => {
    const findFirst = jest.fn().mockResolvedValue({
      action: CloudParserConsentAction.GRANTED,
      noticeVersion: AI_CLOUD_PARSER_CONSENT_VERSION,
    });
    const prisma = {
      cloudParserConsentEvent: { findFirst },
    };
    const service = new AiUsageService(
      prisma as unknown as ConstructorParameters<typeof AiUsageService>[0],
      { runtimeConfig } as ConstructorParameters<typeof AiUsageService>[1],
    );

    await expect(service.hasActiveCloudParserConsent('user-1')).resolves.toBe(
      true,
    );

    findFirst.mockResolvedValueOnce({
      action: CloudParserConsentAction.WITHDRAWN,
      noticeVersion: AI_CLOUD_PARSER_CONSENT_VERSION,
    });
    await expect(service.hasActiveCloudParserConsent('user-1')).resolves.toBe(
      false,
    );
  });
});
