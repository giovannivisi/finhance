import { Prisma } from '@finhance/db';
import { UsersService } from '@/users/users.service';

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
});
