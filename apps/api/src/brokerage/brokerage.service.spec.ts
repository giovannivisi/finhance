import { BadRequestException } from '@nestjs/common';
import { BrokerageService } from '@brokerage/brokerage.service';
import {
  AccountType,
  AssetKind,
  AssetType,
  BrokerageOperationKind,
  Prisma,
} from '@finhance/db';

const OWNER_ID = 'owner-1';

function createAccount(
  overrides: Partial<Record<string, unknown>> = {},
): Record<string, unknown> {
  const now = new Date('2026-05-20T09:00:00.000Z');

  return {
    id: 'account-1',
    userId: OWNER_ID,
    name: 'Broker account',
    type: AccountType.BROKER,
    currency: 'EUR',
    institution: null,
    notes: null,
    order: 0,
    openingBalance: new Prisma.Decimal('0'),
    openingBalanceDate: null,
    archivedAt: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function createAsset(
  overrides: Partial<Record<string, unknown>> = {},
): Record<string, unknown> {
  const now = new Date('2026-05-20T09:00:00.000Z');

  return {
    id: 'asset-1',
    userId: OWNER_ID,
    accountId: 'account-1',
    name: 'US equity',
    type: AssetType.ASSET,
    kind: AssetKind.STOCK,
    liabilityKind: null,
    ticker: 'AAPL',
    exchange: 'NASDAQ',
    quantity: new Prisma.Decimal('2'),
    unitPrice: new Prisma.Decimal('100'),
    balance: new Prisma.Decimal('200'),
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

function createDashboardAsset(
  overrides: Partial<Record<string, unknown>> = {},
): Record<string, unknown> {
  return {
    id: 'asset-1',
    name: 'US equity',
    type: 'ASSET',
    accountId: 'account-1',
    kind: AssetKind.STOCK,
    liabilityKind: null,
    ticker: 'AAPL',
    exchange: 'NASDAQ',
    quantity: 10,
    unitPrice: 100,
    balance: 1000,
    currency: 'USD',
    notes: null,
    order: 0,
    lastPrice: null,
    lastPriceAt: null,
    lastFxRate: null,
    lastFxRateAt: null,
    accountName: 'Broker account',
    accountType: AccountType.BROKER,
    currentValue: 1100,
    referenceValue: 1000,
    valuationSource: 'LIVE',
    valuationAsOf: null,
    isStale: false,
    ...overrides,
  };
}

function createDashboard(
  overrides: Partial<Record<string, unknown>> = {},
): Record<string, unknown> {
  return {
    reportingCurrency: 'EUR',
    assets: [],
    summary: { assets: 0, liabilities: 0, netWorth: 0 },
    pricingStatus: {
      state: 'FRESH',
      refreshSuggested: false,
      hasStaleQuotes: false,
      hasStaleFx: false,
      hasMissingFx: false,
    },
    assetKindOrder: [],
    lastRefreshAt: null,
    latestSnapshotDate: null,
    latestSnapshotCapturedAt: null,
    latestSnapshotIsPartial: null,
    ...overrides,
  };
}

describe('BrokerageService', () => {
  let service: BrokerageService;
  let prisma: {
    $transaction: jest.Mock;
    account: {
      findFirst: jest.Mock;
    };
    asset: {
      findFirst: jest.Mock;
      findMany: jest.Mock;
      update: jest.Mock;
      create: jest.Mock;
    };
    brokerageOperation: {
      create: jest.Mock;
      findMany: jest.Mock;
    };
    portfolioAssetKindTarget: {
      deleteMany: jest.Mock;
      createMany: jest.Mock;
    };
    portfolioSecurityTarget: {
      deleteMany: jest.Mock;
      createMany: jest.Mock;
    };
  };
  let accounts: {
    assertPostedAtAllowed: jest.Mock;
  };
  let assets: {
    getDashboard: jest.Mock;
  };
  let prices: {
    getMarketPrice: jest.Mock;
    getMarketSeries: jest.Mock;
    getFxSeries: jest.Mock;
    getStoredFxRateSnapshot: jest.Mock;
  };
  let transactions: {
    applyAccountCashMovement: jest.Mock;
    create: jest.Mock;
  };

  beforeEach(() => {
    prisma = {
      $transaction: jest.fn(),
      account: {
        findFirst: jest.fn(),
      },
      asset: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
        create: jest.fn(),
      },
      brokerageOperation: {
        create: jest.fn(),
        findMany: jest.fn(),
      },
      portfolioAssetKindTarget: {
        deleteMany: jest.fn(),
        createMany: jest.fn(),
      },
      portfolioSecurityTarget: {
        deleteMany: jest.fn(),
        createMany: jest.fn(),
      },
    };

    prisma.$transaction.mockImplementation(
      async (work: (tx: typeof prisma) => Promise<unknown>) => work(prisma),
    );

    accounts = {
      assertPostedAtAllowed: jest.fn(),
    };
    assets = {
      getDashboard: jest.fn(),
    };
    prices = {
      getMarketPrice: jest.fn(),
      getMarketSeries: jest.fn(),
      getFxSeries: jest.fn(),
      getStoredFxRateSnapshot: jest.fn(),
    };
    transactions = {
      applyAccountCashMovement: jest.fn(),
      create: jest.fn(),
    };

    service = new BrokerageService(
      prisma as never,
      accounts as never,
      assets as never,
      prices as never,
      transactions as never,
    );
  });

  it('rejects duplicate asset-class targets before touching the database', async () => {
    await expect(
      service.updateAllocationTargets('owner-1', {
        assetKindTargets: [
          { kind: AssetKind.STOCK, targetPercent: 50 },
          { kind: AssetKind.STOCK, targetPercent: 50 },
        ],
        securityTargets: [],
      }),
    ).rejects.toThrow(
      new BadRequestException(
        'Duplicate asset-class targets are not allowed: STOCK.',
      ),
    );

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects duplicate security targets after normalising ticker and exchange', async () => {
    await expect(
      service.updateAllocationTargets('owner-1', {
        assetKindTargets: [],
        securityTargets: [
          {
            kind: AssetKind.STOCK,
            ticker: 'aapl',
            exchange: '.l',
            targetPercent: 60,
          },
          {
            kind: AssetKind.STOCK,
            ticker: 'AAPL',
            exchange: '.L',
            targetPercent: 40,
          },
        ],
      }),
    ).rejects.toThrow(
      new BadRequestException(
        'Duplicate security targets are not allowed: STOCK:AAPL:.L.',
      ),
    );

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('blocks backdated buys before mutating brokerage cash', async () => {
    const openingBalanceDate = new Date('2026-05-20T00:00:00.000Z');
    prisma.account.findFirst.mockResolvedValue(
      createAccount({ openingBalanceDate }),
    );
    accounts.assertPostedAtAllowed.mockImplementation(() => {
      throw new BadRequestException(
        'Transactions before 2026-05-20 are not allowed for account Broker account.',
      );
    });

    await expect(
      service.createBuy(OWNER_ID, 'account-1', {
        name: 'Apple',
        kind: AssetKind.STOCK,
        ticker: 'AAPL',
        exchange: 'NASDAQ',
        currency: 'USD',
        quantity: 1,
        unitPrice: 100,
        postedAt: '2026-05-19T12:00:00.000Z',
      }),
    ).rejects.toThrow(
      new BadRequestException(
        'Transactions before 2026-05-20 are not allowed for account Broker account.',
      ),
    );

    expect(transactions.applyAccountCashMovement).not.toHaveBeenCalled();
  });

  it('records top-up buys in the existing holding currency', async () => {
    prisma.account.findFirst.mockResolvedValue(createAccount());
    prisma.asset.findFirst.mockResolvedValue(createAsset());
    prisma.asset.update.mockResolvedValue(createAsset());
    prisma.brokerageOperation.create.mockImplementation(
      (args: { data: { currency?: string } & Record<string, unknown> }) => {
        expect(args.data.currency).toBe('USD');

        return {
          id: 'operation-1',
          userId: OWNER_ID,
          accountId: 'account-1',
          assetId: 'asset-1',
          kind: args.data.kind,
          postedAt: args.data.postedAt,
          currency: args.data.currency,
          quantity: args.data.quantity,
          unitPrice: args.data.unitPrice,
          grossAmount: args.data.grossAmount,
          feeAmount: args.data.feeAmount,
          cashAmount: args.data.cashAmount,
          realisedGainLoss: args.data.realisedGainLoss,
          notes: args.data.notes,
          mirroredTransactionId: args.data.mirroredTransactionId,
          createdAt: new Date('2026-05-20T09:00:00.000Z'),
          updatedAt: new Date('2026-05-20T09:00:00.000Z'),
        };
      },
    );

    await service.createBuy(OWNER_ID, 'account-1', {
      assetId: 'asset-1',
      kind: AssetKind.STOCK,
      currency: 'EUR',
      quantity: 1,
      unitPrice: 100,
      feeAmount: 1,
      postedAt: '2026-05-20T12:00:00.000Z',
    });

    expect(prisma.brokerageOperation.create).toHaveBeenCalledTimes(1);
  });

  describe('getPerformance', () => {
    it('returns an empty response when the account has no active positions', async () => {
      prisma.account.findFirst.mockResolvedValue(createAccount());
      assets.getDashboard.mockResolvedValue(createDashboard({ assets: [] }));

      const result = await service.getPerformance(OWNER_ID, 'account-1', '1Y');

      expect(result.points).toEqual([]);
      expect(result.baselineValue).toBeNull();
      expect(result.latestValue).toBeNull();
      expect(result.pricingStatus.state).toBe('FRESH');
      expect(prices.getMarketSeries).not.toHaveBeenCalled();
    });

    it('reconstructs a quantity step around a mid-range BUY', async () => {
      const now = Date.now();
      const tEarly = now - 1000 * 60 * 60 * 24 * 100; // ~100 days ago
      const tLate = now - 1000 * 60 * 60 * 24 * 10; // ~10 days ago
      const buyPostedAt = now - 1000 * 60 * 60 * 24 * 50; // ~50 days ago

      prisma.account.findFirst.mockResolvedValue(
        createAccount({ currency: 'EUR' }),
      );
      assets.getDashboard.mockResolvedValue(
        createDashboard({
          reportingCurrency: 'EUR',
          assets: [
            createDashboardAsset({
              id: 'asset-1',
              currency: 'EUR',
              quantity: 10,
            }),
          ],
        }),
      );
      prisma.asset.findMany.mockResolvedValue([
        createAsset({
          id: 'asset-1',
          currency: 'EUR',
          quantity: new Prisma.Decimal('10'),
        }),
      ]);
      prices.getMarketSeries.mockResolvedValue({
        points: [
          { t: tEarly, price: 100 },
          { t: tLate, price: 110 },
        ],
        previousClose: 95,
        latestPrice: 110,
      });
      prisma.brokerageOperation.findMany.mockResolvedValue([
        {
          id: 'op-1',
          assetId: 'asset-1',
          kind: BrokerageOperationKind.BUY,
          postedAt: new Date(buyPostedAt),
          quantity: new Prisma.Decimal('5'),
        },
      ]);

      const result = await service.getPerformance(OWNER_ID, 'account-1', '1Y');

      const earlyPoint = result.points.find((point) => point.t === tEarly);
      const latePoint = result.points.find((point) => point.t === tLate);

      expect(earlyPoint?.value).toBeCloseTo(5 * 100, 2); // 5 units held before the BUY
      expect(latePoint?.value).toBeCloseTo(10 * 110, 2); // 10 units held after the BUY
    });

    it('applies an FX series when the position currency differs from the reporting currency', async () => {
      const now = Date.now();
      const t1 = now - 1000 * 60 * 60 * 24 * 5;

      prisma.account.findFirst.mockResolvedValue(
        createAccount({ currency: 'EUR' }),
      );
      assets.getDashboard.mockResolvedValue(
        createDashboard({
          reportingCurrency: 'EUR',
          assets: [
            createDashboardAsset({
              id: 'asset-1',
              currency: 'USD',
              quantity: 10,
            }),
          ],
        }),
      );
      prisma.asset.findMany.mockResolvedValue([
        createAsset({
          id: 'asset-1',
          currency: 'USD',
          quantity: new Prisma.Decimal('10'),
        }),
      ]);
      prices.getMarketSeries.mockResolvedValue({
        points: [{ t: t1, price: 100 }],
        previousClose: 95,
        latestPrice: 100,
      });
      prices.getFxSeries.mockResolvedValue({
        points: [{ t: t1, price: 0.9 }],
        previousClose: 0.89,
        latestPrice: 0.9,
      });
      prices.getStoredFxRateSnapshot.mockResolvedValue({
        rate: new Prisma.Decimal('0.9'),
        status: 'EXACT',
        source: 'LIVE',
        rateDate: new Date(),
        updatedAt: new Date(),
      });
      prisma.brokerageOperation.findMany.mockResolvedValue([]);

      const result = await service.getPerformance(OWNER_ID, 'account-1', '1Y');

      expect(prices.getFxSeries).toHaveBeenCalledWith('USD', 'EUR', '1Y');
      const point = result.points.find((p) => p.t === t1);
      expect(point?.value).toBeCloseTo(10 * 100 * 0.9, 2);
      expect(result.pricingStatus.state).toBe('FRESH');
    });

    it('falls back to a constant valuation and reports PARTIAL when the price series fails', async () => {
      prisma.account.findFirst.mockResolvedValue(
        createAccount({ currency: 'EUR' }),
      );
      assets.getDashboard.mockResolvedValue(
        createDashboard({
          reportingCurrency: 'EUR',
          assets: [
            createDashboardAsset({
              id: 'asset-1',
              currency: 'EUR',
              quantity: 10,
              currentValue: 1234,
              referenceValue: 1000,
            }),
          ],
        }),
      );
      prisma.asset.findMany.mockResolvedValue([
        createAsset({
          id: 'asset-1',
          currency: 'EUR',
          quantity: new Prisma.Decimal('10'),
        }),
      ]);
      prices.getMarketSeries.mockResolvedValue(null);
      prisma.brokerageOperation.findMany.mockResolvedValue([]);

      const result = await service.getPerformance(OWNER_ID, 'account-1', '1M');

      expect(result.pricingStatus.state).toBe('PARTIAL');
      expect(result.points).toHaveLength(2);
      expect(result.points.every((point) => point.value === 1234)).toBe(true);
      expect(result.baselineValue).toBe(1234);
      expect(result.latestValue).toBe(1234);
    });

    it('uses the previous close as the 1D baseline when available', async () => {
      const now = Date.now();
      const tRecent = now - 1000 * 60 * 30; // 30 minutes ago

      prisma.account.findFirst.mockResolvedValue(
        createAccount({ currency: 'EUR' }),
      );
      assets.getDashboard.mockResolvedValue(
        createDashboard({
          reportingCurrency: 'EUR',
          assets: [
            createDashboardAsset({
              id: 'asset-1',
              currency: 'EUR',
              quantity: 10,
            }),
          ],
        }),
      );
      prisma.asset.findMany.mockResolvedValue([
        createAsset({
          id: 'asset-1',
          currency: 'EUR',
          quantity: new Prisma.Decimal('10'),
        }),
      ]);
      prices.getMarketSeries.mockResolvedValue({
        points: [{ t: tRecent, price: 105 }],
        previousClose: 100,
        latestPrice: 105,
      });
      prisma.brokerageOperation.findMany.mockResolvedValue([]);

      const result = await service.getPerformance(OWNER_ID, 'account-1', '1D');

      // previousClose (100) x quantity (10) = 1000
      expect(result.baselineValue).toBe(1000);
      // latest point: price (105) x quantity (10) = 1050
      expect(result.latestValue).toBe(1050);
      expect(result.changeAbsolute).toBe(50);
      expect(result.changePercent).toBe(5);
    });
  });
});
