import { Prisma } from '@finhance/db';
import { UsersService } from '@/users/users.service';

describe('UsersService', () => {
  it('returns default settings when the user has no stored settings', async () => {
    const prisma = {
      user: {
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          userSettings: null,
        }),
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
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          userSettings: {
            showTransactionTimes: false,
          },
        }),
        update: jest.fn().mockResolvedValue({
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
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'local-dev' },
      data: {
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
});
