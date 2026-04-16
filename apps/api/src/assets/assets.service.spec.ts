import { ConflictException } from '@nestjs/common';
import { AssetKind, AssetType, LiabilityKind, Prisma } from '@prisma/client';
import { AssetsService } from '@assets/assets.service';

function createAsset(overrides: Partial<Record<string, unknown>> = {}) {
  const now = new Date();

  return {
    id: 'asset-1',
    userId: null,
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
      update: jest.Mock;
      create: jest.Mock;
      delete: jest.Mock;
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

  beforeEach(() => {
    prisma = {
      asset: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        create: jest.fn(),
        delete: jest.fn(),
      },
      $transaction: jest.fn(),
    };

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

    service = new AssetsService(prisma as never, prices as never);
  });

  it('merges repeated market buys using decimal math', async () => {
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

    prisma.$transaction.mockImplementation(async (callback: (tx: { asset: typeof transactionAsset }) => Promise<unknown>) =>
      callback({ asset: transactionAsset }),
    );

    await service.create({
      name: 'Apple',
      type: AssetType.ASSET,
      kind: AssetKind.STOCK,
      ticker: 'aapl',
      exchange: '',
      quantity: 3,
      unitPrice: 13.125,
      currency: 'usd',
    });

    const updateCall = transactionAsset.update.mock.calls[0][0];
    expect(updateCall.data.quantity.toString()).toBe('4.5');
    expect(updateCall.data.balance.toString()).toBe('54.75');
    expect(updateCall.data.unitPrice.toString()).toBe('12.166666666666666667');
  });

  it('computes live current value and EUR summary with FX conversion', async () => {
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

    const dashboard = await service.getDashboard();

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

    const dashboard = await service.getDashboard();

    expect(dashboard.assets[0].currentValue).toBeNull();
    expect(dashboard.assets[0].referenceValue).toBe(72);
    expect(dashboard.assets[0].valuationSource).toBe('AVG_COST');
    expect(dashboard.summary.assets).toBe(72);
  });

  it('deduplicates FX refresh work and returns stale count', async () => {
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

    const response = await service.refreshAssets();

    expect(prices.getMarketPrice).toHaveBeenCalledTimes(1);
    expect(prices.getFxRate).toHaveBeenCalledTimes(1);
    expect(prisma.asset.update).toHaveBeenCalledTimes(2);
    expect(response.updatedCount).toBe(2);
    expect(response.staleCount).toBe(0);
  });

  it('rejects updates that would collide with another position', async () => {
    prisma.asset.findUnique
      .mockResolvedValueOnce(createAsset())
      .mockResolvedValueOnce(createAsset({ id: 'asset-2' }));

    await expect(
      service.update('asset-1', {
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
  });
});
