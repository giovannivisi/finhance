import { ConflictException } from '@nestjs/common';
import { AssetsService } from '@assets/assets.service';
import { OperationLockService } from '@/request-safety/operation-lock.service';
import { AssetKind, AssetType, Prisma } from '@prisma/client';

const OWNER_ID = 'local-dev';
type MarketPositionWhere = {
  userId_type_kind_ticker_exchange: {
    userId: string;
    type: AssetType;
    kind: AssetKind;
    ticker: string;
    exchange: string;
  };
};

type AssetUpdateCall = {
  data: {
    quantity: Prisma.Decimal;
    balance: Prisma.Decimal;
    unitPrice: Prisma.Decimal;
  };
};

function firstCallArg<T>(mockFn: jest.Mock): T {
  const calls = mockFn.mock.calls as unknown[][];
  return calls[0]?.[0] as T;
}

function createAsset(overrides: Partial<Record<string, unknown>> = {}) {
  const now = new Date();

  return {
    id: 'asset-1',
    userId: OWNER_ID,
    accountId: null,
    name: 'Apple',
    type: AssetType.ASSET,
    kind: AssetKind.STOCK,
    liabilityKind: null,
    ticker: 'AAPL',
    exchange: '',
    quantity: new Prisma.Decimal('2'),
    unitPrice: new Prisma.Decimal('40'),
    balance: new Prisma.Decimal('80'),
    currency: 'USD',
    notes: null,
    order: 0,
    createdAt: now,
    updatedAt: now,
    lastPrice: null,
    lastPriceAt: null,
    lastFxRate: null,
    lastFxRateAt: null,
    ...overrides,
  };
}

describe('AssetsService', () => {
  let service: AssetsService;
  let prisma: {
    asset: {
      findMany: jest.Mock;
      findUnique: jest.Mock;
      findFirst: jest.Mock;
      update: jest.Mock;
      create: jest.Mock;
      delete: jest.Mock;
    };
    portfolioState: {
      findUnique: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
    $transaction: jest.Mock;
  };
  let prices: {
    normalizeCurrency: jest.Mock;
    normalizeTicker: jest.Mock;
    buildMarketSymbol: jest.Mock;
    getMarketPrice: jest.Mock;
    getFxRate: jest.Mock;
  };
  let accounts: {
    assertAccountAssignmentAllowed: jest.Mock;
  };
  let operationLocks: {
    runExclusive: jest.Mock;
  };

  beforeEach(() => {
    prisma = {
      asset: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
        create: jest.fn(),
        delete: jest.fn(),
      },
      portfolioState: {
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      $transaction: jest.fn(),
    };

    prisma.$transaction.mockImplementation(
      async (
        callback: (tx: {
          asset: typeof prisma.asset;
          portfolioState: typeof prisma.portfolioState;
        }) => Promise<unknown>,
      ) =>
        callback({
          asset: prisma.asset,
          portfolioState: prisma.portfolioState,
        }),
    );

    prices = {
      normalizeCurrency: jest.fn((currency?: string | null) =>
        (currency ?? 'EUR').trim().toUpperCase(),
      ),
      normalizeTicker: jest.fn((ticker: string) => ticker.trim().toUpperCase()),
      buildMarketSymbol: jest.fn(
        (input: { ticker: string; exchange?: string | null }) =>
          `${input.ticker}${input.exchange ?? ''}`,
      ),
      getMarketPrice: jest.fn(),
      getFxRate: jest.fn(),
    };

    accounts = {
      assertAccountAssignmentAllowed: jest.fn(),
    };
    operationLocks = {
      runExclusive: jest.fn((_options: unknown, work: () => unknown) => work()),
    };

    service = new AssetsService(
      prisma as never,
      prices as never,
      accounts as never,
      operationLocks as unknown as OperationLockService,
    );
  });

  it('merges repeated market buys using decimal math within the owner scope', async () => {
    const existing = createAsset({
      quantity: new Prisma.Decimal('1.5'),
      unitPrice: new Prisma.Decimal('10.25'),
      balance: new Prisma.Decimal('15.375'),
    });
    const updated = createAsset({
      quantity: new Prisma.Decimal('4.5'),
      unitPrice: new Prisma.Decimal('12.1666666667'),
      balance: new Prisma.Decimal('54.75'),
    });
    const transactionAsset = {
      findUnique: jest.fn().mockResolvedValue(existing),
      create: jest.fn(),
      update: jest.fn().mockResolvedValue(updated),
    };

    prisma.$transaction.mockImplementation(
      async (
        callback: (tx: {
          asset: typeof transactionAsset;
          portfolioState: typeof prisma.portfolioState;
        }) => Promise<unknown>,
      ) =>
        callback({
          asset: transactionAsset,
          portfolioState: prisma.portfolioState,
        }),
    );

    await service.create(OWNER_ID, {
      name: 'Apple',
      type: AssetType.ASSET,
      kind: AssetKind.STOCK,
      ticker: 'aapl',
      exchange: '',
      quantity: 3,
      unitPrice: 13.125,
      currency: 'usd',
    });

    const findUniqueArgs = firstCallArg<{
      where: MarketPositionWhere;
    }>(transactionAsset.findUnique);
    expect(findUniqueArgs.where.userId_type_kind_ticker_exchange).toMatchObject(
      {
        userId: OWNER_ID,
        ticker: 'AAPL',
        exchange: '',
      },
    );

    const updateCall = firstCallArg<AssetUpdateCall>(transactionAsset.update);
    expect(updateCall.data.quantity.toString()).toBe('4.5');
    expect(updateCall.data.balance.toString()).toBe('54.75');
    expect(updateCall.data.unitPrice.toString()).toBe('12.166666666666666667');
  });

  it('computes live current value and EUR summary within one owner portfolio', async () => {
    const now = new Date();
    prisma.asset.findMany.mockResolvedValue([
      createAsset({
        quantity: new Prisma.Decimal('2'),
        balance: new Prisma.Decimal('80'),
        lastPrice: new Prisma.Decimal('50'),
        lastPriceAt: now,
        lastFxRate: new Prisma.Decimal('0.9'),
        lastFxRateAt: now,
      }),
    ]);

    const dashboard = await service.getDashboard(OWNER_ID);

    expect(prisma.asset.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: OWNER_ID },
      }),
    );
    expect(dashboard.assets[0].currentValue).toBe(90);
    expect(dashboard.assets[0].referenceValue).toBe(72);
    expect(dashboard.assets[0].valuationSource).toBe('LIVE');
    expect(dashboard.summary.assets).toBe(90);
    expect(dashboard.summary.netWorth).toBe(90);
  });

  it('falls back to average cost when no quote is available', async () => {
    const now = new Date();
    prisma.asset.findMany.mockResolvedValue([
      createAsset({
        lastPrice: null,
        lastPriceAt: null,
        lastFxRate: new Prisma.Decimal('0.9'),
        lastFxRateAt: now,
      }),
    ]);

    const dashboard = await service.getDashboard(OWNER_ID);

    expect(dashboard.assets[0].currentValue).toBeNull();
    expect(dashboard.assets[0].referenceValue).toBe(72);
    expect(dashboard.assets[0].valuationSource).toBe('AVG_COST');
    expect(dashboard.summary.assets).toBe(72);
  });

  it('assigns non-market assets to validated accounts', async () => {
    const created = createAsset({
      accountId: 'account-1',
      kind: AssetKind.CASH,
      ticker: null,
      exchange: null,
      quantity: null,
      unitPrice: null,
      balance: new Prisma.Decimal('100'),
      currency: 'EUR',
    });
    prisma.asset.create.mockResolvedValue(created);

    await service.create(OWNER_ID, {
      name: 'Cash reserve',
      type: AssetType.ASSET,
      kind: AssetKind.CASH,
      balance: 100,
      currency: 'EUR',
      accountId: 'account-1',
    });

    expect(accounts.assertAccountAssignmentAllowed).toHaveBeenCalledWith(
      OWNER_ID,
      'account-1',
    );
    const createCall = firstCallArg<{
      data: {
        accountId: string | null;
      };
    }>(prisma.asset.create);

    expect(createCall.data.accountId).toBe('account-1');
  });

  it('passes the current account context during asset updates', async () => {
    const existing = createAsset({
      accountId: 'account-1',
      kind: AssetKind.CASH,
      ticker: null,
      exchange: null,
      quantity: null,
      unitPrice: null,
      balance: new Prisma.Decimal('100'),
      currency: 'EUR',
    });
    prisma.asset.findFirst.mockResolvedValue(existing);
    prisma.asset.update.mockResolvedValue(existing);

    await service.update(OWNER_ID, existing.id, {
      name: 'Cash reserve',
      type: AssetType.ASSET,
      kind: AssetKind.CASH,
      balance: 100,
      currency: 'EUR',
      accountId: 'account-1',
    });

    expect(accounts.assertAccountAssignmentAllowed).toHaveBeenCalledWith(
      OWNER_ID,
      'account-1',
      'account-1',
    );
  });

  it('keeps dashboard totals unchanged when assets are assigned to accounts', async () => {
    prisma.asset.findMany.mockResolvedValue([
      createAsset({
        accountId: 'account-1',
        kind: AssetKind.CASH,
        ticker: null,
        exchange: null,
        quantity: null,
        unitPrice: null,
        balance: new Prisma.Decimal('80'),
        currency: 'EUR',
      }),
    ]);

    const dashboard = await service.getDashboard(OWNER_ID);

    expect(dashboard.summary.assets).toBe(80);
    expect(dashboard.summary.netWorth).toBe(80);
  });

  it('deduplicates FX refresh work and returns stale count for one owner', async () => {
    const refreshAsset = createAsset({
      lastPrice: null,
      lastPriceAt: null,
      lastFxRate: null,
      lastFxRateAt: null,
    });
    const usdCash = createAsset({
      id: 'asset-2',
      name: 'Cash',
      kind: AssetKind.CASH,
      ticker: null,
      exchange: null,
      quantity: null,
      unitPrice: null,
      balance: new Prisma.Decimal('10'),
      lastPrice: null,
      lastPriceAt: null,
      lastFxRate: null,
      lastFxRateAt: null,
    });

    prisma.asset.findMany
      .mockResolvedValueOnce([refreshAsset, usdCash])
      .mockResolvedValueOnce([
        createAsset({
          lastPrice: new Prisma.Decimal('50'),
          lastPriceAt: new Date(),
          lastFxRate: new Prisma.Decimal('0.9'),
          lastFxRateAt: new Date(),
        }),
        createAsset({
          id: 'asset-2',
          name: 'Cash',
          kind: AssetKind.CASH,
          ticker: null,
          exchange: null,
          quantity: null,
          unitPrice: null,
          balance: new Prisma.Decimal('10'),
          lastPrice: null,
          lastPriceAt: null,
          lastFxRate: new Prisma.Decimal('0.9'),
          lastFxRateAt: new Date(),
        }),
      ]);
    prisma.asset.update.mockResolvedValue(createAsset());
    prices.getMarketPrice.mockResolvedValue(new Prisma.Decimal('50'));
    prices.getFxRate.mockResolvedValue(new Prisma.Decimal('0.9'));

    const response = await service.refreshAssets(OWNER_ID);

    expect(operationLocks.runExclusive).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: OWNER_ID,
      }),
      expect.any(Function),
    );
    expect(prisma.asset.findMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: { userId: OWNER_ID },
      }),
    );
    expect(prices.getMarketPrice).toHaveBeenCalledTimes(1);
    expect(prices.getFxRate).toHaveBeenCalledTimes(1);
    expect(prisma.asset.update).toHaveBeenCalledTimes(2);
    expect(response.updatedCount).toBe(2);
    expect(response.staleCount).toBe(0);
  });

  it('rejects refreshes during the success-based cooldown window', async () => {
    operationLocks.runExclusive.mockRejectedValueOnce(
      new Error('Refresh is cooling down. Try again in 1s.'),
    );

    await expect(service.refreshAssets(OWNER_ID)).rejects.toThrow(
      'Refresh is cooling down.',
    );
    expect(prisma.asset.findMany).not.toHaveBeenCalled();
  });

  it('rejects refreshes while another refresh is still in flight', async () => {
    operationLocks.runExclusive.mockRejectedValueOnce(
      new Error('Refresh already in progress.'),
    );

    await expect(service.refreshAssets(OWNER_ID)).rejects.toThrow(
      'Refresh already in progress.',
    );
    expect(prisma.asset.findMany).not.toHaveBeenCalled();
  });

  it('surfaces refresh work failures after claiming the shared operation lock', async () => {
    const asset = createAsset();
    prisma.asset.findMany.mockResolvedValueOnce([asset]);
    prices.getMarketPrice.mockRejectedValue(new Error('quote down'));

    await expect(service.refreshAssets(OWNER_ID)).rejects.toThrow('quote down');
    expect(operationLocks.runExclusive).toHaveBeenCalledTimes(1);
  });

  it('uses the shared operation lock before refreshing asset quotes', async () => {
    const refreshAsset = createAsset();
    prisma.asset.findMany
      .mockResolvedValueOnce([refreshAsset])
      .mockResolvedValueOnce([
        createAsset({
          lastPrice: new Prisma.Decimal('50'),
          lastPriceAt: new Date(),
          lastFxRate: new Prisma.Decimal('0.9'),
          lastFxRateAt: new Date(),
        }),
      ]);
    prisma.asset.update.mockResolvedValue(createAsset());
    prices.getMarketPrice.mockResolvedValue(new Prisma.Decimal('50'));
    prices.getFxRate.mockResolvedValue(new Prisma.Decimal('0.9'));

    await service.refreshAssets(OWNER_ID);

    expect(operationLocks.runExclusive).toHaveBeenCalledTimes(1);
    expect(prisma.asset.findMany).toHaveBeenCalled();
  });

  it('rejects updates that would collide with another position in the same owner scope', async () => {
    prisma.asset.findFirst.mockResolvedValueOnce(createAsset());
    prisma.asset.findUnique.mockResolvedValueOnce(
      createAsset({ id: 'asset-2' }),
    );

    await expect(
      service.update(OWNER_ID, 'asset-1', {
        name: 'Apple',
        type: AssetType.ASSET,
        kind: AssetKind.STOCK,
        ticker: 'AAPL',
        exchange: '',
        quantity: 2,
        unitPrice: 40,
        currency: 'USD',
      }),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(prisma.asset.findUnique).toHaveBeenCalledWith({
      where: {
        userId_type_kind_ticker_exchange: {
          userId: OWNER_ID,
          type: AssetType.ASSET,
          kind: AssetKind.STOCK,
          ticker: 'AAPL',
          exchange: '',
        },
      },
    });
  });
});
