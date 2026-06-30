import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@finhance/db';
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
  'idempotencyRequest',
  'operationState',
] as const;

describe('UsersService', () => {
  it('returns default settings when the user record does not exist yet', async () => {
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue(null),
      },
    } as unknown as ConstructorParameters<typeof UsersService>[0];

    const service = new UsersService(prisma);

    await expect(service.getSettings('local-dev')).resolves.toEqual({
      reportingCurrency: 'EUR',
      showTransactionTimes: true,
      startPage: 'DASHBOARD',
    });
  });

  it('merges partial updates and stores the normalized settings blob', async () => {
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({
          userSettings: {
            showTransactionTimes: false,
          },
        }),
        upsert: jest.fn().mockResolvedValue({
          userSettings: {
            showTransactionTimes: false,
            startPage: 'BROKERAGE',
          },
        }),
      },
    } as unknown as ConstructorParameters<typeof UsersService>[0];

    const service = new UsersService(prisma);

    await expect(
      service.updateSettings('local-dev', { startPage: 'BROKERAGE' }),
    ).resolves.toEqual({
      reportingCurrency: 'EUR',
      showTransactionTimes: false,
      startPage: 'BROKERAGE',
    });

    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(prisma.user.upsert).toHaveBeenCalledWith({
      where: { id: 'local-dev' },
      update: {
        userSettings: {
          reportingCurrency: 'EUR',
          showTransactionTimes: false,
          startPage: 'BROKERAGE',
        } as unknown as Prisma.InputJsonValue,
      },
      create: {
        id: 'local-dev',
        email: 'finhance-user+local-dev@placeholder.local',
        userSettings: {
          reportingCurrency: 'EUR',
          showTransactionTimes: false,
          startPage: 'BROKERAGE',
        } as unknown as Prisma.InputJsonValue,
      },
      select: {
        userSettings: true,
      },
    });
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
