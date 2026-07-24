import { Prisma } from '@finhance/db';
import {
  MarketDataRateLimitService,
  MarketDataRequestLimitExceededError,
  resolveMarketDataRequestLimitPerMinute,
} from '@prices/market-data-rate-limit.service';

describe('MarketDataRateLimitService', () => {
  const now = new Date('2026-07-24T10:15:30.000Z');
  let requestRateLimit: {
    deleteMany: jest.Mock;
    findUnique: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
  };
  let prisma: { $transaction: jest.Mock };
  let service: MarketDataRateLimitService;

  beforeEach(() => {
    requestRateLimit = {
      deleteMany: jest.fn(),
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn(),
      update: jest.fn(),
    };
    prisma = { $transaction: jest.fn() };
    prisma.$transaction.mockImplementation(
      async (
        callback: (transaction: {
          requestRateLimit: typeof requestRateLimit;
        }) => Promise<void>,
      ) => callback({ requestRateLimit }),
    );
    service = new MarketDataRateLimitService(prisma as never);
  });

  it('reserves a provider-wide slot in the current minute window', async () => {
    await service.reserve('marketstack', now);

    expect(requestRateLimit.create).toHaveBeenCalledWith({
      data: {
        key: 'market-data:marketstack:1784888100000',
        scope: 'market-data-provider',
        clientKey: 'marketstack',
        count: 1,
        resetAt: new Date('2026-07-24T10:16:00.000Z'),
      },
    });
    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    });
  });

  it('rejects an exhausted provider-wide budget before an upstream request', async () => {
    requestRateLimit.findUnique.mockResolvedValue({ count: 10 });

    await expect(service.reserve('marketstack', now)).rejects.toBeInstanceOf(
      MarketDataRequestLimitExceededError,
    );
    expect(requestRateLimit.create).not.toHaveBeenCalled();
    expect(requestRateLimit.update).not.toHaveBeenCalled();
  });

  it('falls back to the safe default for an invalid configuration value', () => {
    expect(
      resolveMarketDataRequestLimitPerMinute({
        MARKET_DATA_REQUEST_LIMIT_PER_MINUTE: 'not-a-number',
      }),
    ).toBe(10);
  });
});
