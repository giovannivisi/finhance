import { BadRequestException } from '@nestjs/common';
import { CloudParserConsentAction, Prisma } from '@finhance/db';
import {
  AI_CLOUD_PARSER_CONSENT_VERSION,
  AI_CLOUD_PARSER_PROVIDER,
} from '@/ai/ai.config';
import { UsersService } from '@/users/users.service';

const USER_DATA_DELETION_ORDER = [
  'brokerageOperation',
  'transaction',
  'recurringTransactionOccurrence',
  'recurringTransactionRule',
  'categoryBudgetOverride',
  'categoryBudget',
  'expenseValidationRule',
  'asset',
  'account',
  'category',
  'netWorthSnapshot',
  'importBatch',
  'fxRate',
  'portfolioAssetKindTarget',
  'portfolioSecurityTarget',
  'portfolioState',
  'aiUsageEvent',
  'cloudParserConsentEvent',
  'idempotencyRequest',
  'operationState',
] as const;

describe('UsersService', () => {
  it('returns default settings when the user record does not exist yet', async () => {
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue(null),
      },
      cloudParserConsentEvent: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
    } as unknown as ConstructorParameters<typeof UsersService>[0];

    const service = new UsersService(prisma);

    await expect(service.getSettings('local-dev')).resolves.toEqual({
      cloudParserAvailable: false,
      cloudParserConsentActive: false,
      cloudParserConsentVersion: null,
      cloudParserEnabled: false,
      reportingCurrency: 'EUR',
      showTransactionTimes: true,
      startPage: 'DASHBOARD',
    });
  });

  it('merges partial updates and stores the normalized settings blob', async () => {
    const transactionClient = {
      user: {
        findUnique: jest.fn().mockResolvedValue({
          userSettings: {
            showTransactionTimes: false,
          },
        }),
        upsert: jest.fn().mockResolvedValue({
          id: 'local-dev',
          userSettings: {
            showTransactionTimes: false,
            startPage: 'BROKERAGE',
            reportingCurrency: 'EUR',
            cloudParserEnabled: false,
          },
        }),
      },
      cloudParserConsentEvent: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn(),
      },
    };
    const transaction = jest.fn(
      (
        callback: (tx: typeof transactionClient) => Promise<unknown>,
      ): Promise<unknown> => callback(transactionClient),
    );
    const prisma = {
      $transaction: transaction,
    } as unknown as ConstructorParameters<typeof UsersService>[0];

    const service = new UsersService(prisma);

    await expect(
      service.updateSettings('local-dev', { startPage: 'BROKERAGE' }),
    ).resolves.toEqual({
      cloudParserAvailable: false,
      cloudParserConsentActive: false,
      cloudParserConsentVersion: null,
      cloudParserEnabled: false,
      reportingCurrency: 'EUR',
      showTransactionTimes: false,
      startPage: 'BROKERAGE',
    });

    expect(transactionClient.user.upsert).toHaveBeenCalledWith({
      where: { id: 'local-dev' },
      update: {
        userSettings: {
          cloudParserEnabled: false,
          reportingCurrency: 'EUR',
          showTransactionTimes: false,
          startPage: 'BROKERAGE',
        },
      },
      create: {
        id: 'local-dev',
        email: 'finhance-user+local-dev@placeholder.local',
        userSettings: {
          cloudParserEnabled: false,
          reportingCurrency: 'EUR',
          showTransactionTimes: false,
          startPage: 'BROKERAGE',
        },
      },
      select: {
        id: true,
        userSettings: true,
      },
    });
    expect(
      transactionClient.cloudParserConsentEvent.create,
    ).not.toHaveBeenCalled();
    expect(transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    });
  });

  it('records the current consent when cloud parsing is enabled', async () => {
    const originalGroqApiKey = process.env.GROQ_API_KEY;
    const originalAiDisabled = process.env.AI_DISABLED;
    process.env.GROQ_API_KEY = 'test-key';
    delete process.env.AI_DISABLED;

    try {
      const transactionClient = {
        user: {
          findUnique: jest.fn().mockResolvedValue({ userSettings: {} }),
          upsert: jest.fn().mockResolvedValue({
            id: 'user-1',
            userSettings: {
              cloudParserEnabled: true,
              reportingCurrency: 'EUR',
              showTransactionTimes: true,
              startPage: 'DASHBOARD',
            },
          }),
        },
        cloudParserConsentEvent: {
          findFirst: jest.fn().mockResolvedValue(null),
          create: jest.fn().mockResolvedValue({}),
        },
      };
      const prisma = {
        $transaction: jest.fn(
          (
            callback: (tx: typeof transactionClient) => Promise<unknown>,
          ): Promise<unknown> => callback(transactionClient),
        ),
      } as unknown as ConstructorParameters<typeof UsersService>[0];

      const service = new UsersService(prisma);

      await expect(
        service.updateSettings('user-1', {
          cloudParserEnabled: true,
          cloudParserConsentVersion: AI_CLOUD_PARSER_CONSENT_VERSION,
        }),
      ).resolves.toMatchObject({
        cloudParserAvailable: true,
        cloudParserConsentActive: true,
        cloudParserConsentVersion: AI_CLOUD_PARSER_CONSENT_VERSION,
        cloudParserEnabled: true,
      });

      expect(
        transactionClient.cloudParserConsentEvent.create,
      ).toHaveBeenCalledWith({
        data: {
          userId: 'user-1',
          action: CloudParserConsentAction.GRANTED,
          noticeVersion: AI_CLOUD_PARSER_CONSENT_VERSION,
          provider: AI_CLOUD_PARSER_PROVIDER,
        },
      });
    } finally {
      if (originalGroqApiKey === undefined) {
        delete process.env.GROQ_API_KEY;
      } else {
        process.env.GROQ_API_KEY = originalGroqApiKey;
      }

      if (originalAiDisabled === undefined) {
        delete process.env.AI_DISABLED;
      } else {
        process.env.AI_DISABLED = originalAiDisabled;
      }
    }
  });

  it('records renewed consent when an enabled preference has an old notice grant', async () => {
    const originalGroqApiKey = process.env.GROQ_API_KEY;
    const originalAiDisabled = process.env.AI_DISABLED;
    process.env.GROQ_API_KEY = 'test-key';
    delete process.env.AI_DISABLED;

    try {
      const transactionClient = {
        user: {
          findUnique: jest.fn().mockResolvedValue({
            userSettings: { cloudParserEnabled: true },
          }),
          upsert: jest.fn().mockResolvedValue({
            id: 'user-1',
            userSettings: {
              cloudParserEnabled: true,
              reportingCurrency: 'EUR',
              showTransactionTimes: true,
              startPage: 'DASHBOARD',
            },
          }),
        },
        cloudParserConsentEvent: {
          findFirst: jest.fn().mockResolvedValue({
            action: CloudParserConsentAction.GRANTED,
            noticeVersion: 'cloud-parser-v0',
          }),
          create: jest.fn().mockResolvedValue({}),
        },
      };
      const prisma = {
        $transaction: jest.fn(
          (
            callback: (tx: typeof transactionClient) => Promise<unknown>,
          ): Promise<unknown> => callback(transactionClient),
        ),
      } as unknown as ConstructorParameters<typeof UsersService>[0];

      const service = new UsersService(prisma);

      await expect(
        service.updateSettings('user-1', {
          cloudParserEnabled: true,
          cloudParserConsentVersion: AI_CLOUD_PARSER_CONSENT_VERSION,
        }),
      ).resolves.toMatchObject({
        cloudParserConsentActive: true,
        cloudParserEnabled: true,
      });
      expect(
        transactionClient.cloudParserConsentEvent.create,
      ).toHaveBeenCalledWith({
        data: {
          userId: 'user-1',
          action: CloudParserConsentAction.GRANTED,
          noticeVersion: AI_CLOUD_PARSER_CONSENT_VERSION,
          provider: AI_CLOUD_PARSER_PROVIDER,
        },
      });
    } finally {
      if (originalGroqApiKey === undefined) {
        delete process.env.GROQ_API_KEY;
      } else {
        process.env.GROQ_API_KEY = originalGroqApiKey;
      }

      if (originalAiDisabled === undefined) {
        delete process.env.AI_DISABLED;
      } else {
        process.env.AI_DISABLED = originalAiDisabled;
      }
    }
  });

  it('permanently deletes all user-owned data in dependency order', async () => {
    const deletionOrder: string[] = [];
    const deletionMocks: Partial<
      Record<(typeof USER_DATA_DELETION_ORDER)[number], jest.Mock>
    > = {};
    const transactionClient: Record<string, unknown> = {};

    for (const model of USER_DATA_DELETION_ORDER) {
      const deleteMany = jest.fn().mockImplementation(() => {
        deletionOrder.push(model);
        return Promise.resolve({ count: 1 });
      });
      deletionMocks[model] = deleteMany;
      transactionClient[model] = {
        deleteMany,
      };
    }

    const deleteVerificationTokens = jest.fn().mockImplementation(() => {
      deletionOrder.push('authVerificationToken');
      return Promise.resolve({ count: 1 });
    });
    const deleteUser = jest.fn().mockImplementation(() => {
      deletionOrder.push('user');
      return Promise.resolve({ id: 'user-1' });
    });
    transactionClient.authVerificationToken = {
      deleteMany: deleteVerificationTokens,
    };
    transactionClient.user = {
      findUnique: jest.fn().mockResolvedValue({
        email: 'person@example.com',
      }),
      delete: deleteUser,
    };

    const transaction = jest.fn(
      (callback: (tx: Record<string, unknown>) => Promise<void>) =>
        callback(transactionClient),
    );
    const prisma = {
      $transaction: transaction,
    } as unknown as ConstructorParameters<typeof UsersService>[0];

    const service = new UsersService(prisma);

    await service.deleteAccount('user-1', 'person@example.com');

    expect(deletionOrder).toEqual([
      ...USER_DATA_DELETION_ORDER,
      'authVerificationToken',
      'user',
    ]);
    for (const model of USER_DATA_DELETION_ORDER) {
      expect(deletionMocks[model]).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
      });
    }
    expect(deleteVerificationTokens).toHaveBeenCalledWith({
      where: { identifier: 'person@example.com' },
    });
    expect(transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    });
  });

  it('rejects deletion when the confirmation email is not exact', async () => {
    const deleteUser = jest.fn();
    const transactionClient = {
      user: {
        findUnique: jest.fn().mockResolvedValue({
          email: 'person@example.com',
        }),
        delete: deleteUser,
      },
    };
    const transaction = jest.fn(
      (callback: (tx: typeof transactionClient) => Promise<void>) =>
        callback(transactionClient),
    );
    const prisma = {
      $transaction: transaction,
    } as unknown as ConstructorParameters<typeof UsersService>[0];

    const service = new UsersService(prisma);

    await expect(
      service.deleteAccount('user-1', 'Person@example.com'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(deleteUser).not.toHaveBeenCalled();
  });
});
