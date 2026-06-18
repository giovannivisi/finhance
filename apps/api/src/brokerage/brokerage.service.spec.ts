import { BadRequestException } from '@nestjs/common';
import { BrokerageService } from '@brokerage/brokerage.service';
import {
  AccountType,
  AssetKind,
  AssetType,
  BrokerageOperationKind,
  ImportSource,
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
    transaction: {
      findFirst: jest.Mock;
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
      transaction: {
        findFirst: jest.fn(),
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
    prisma.transaction.findFirst.mockResolvedValue(null);

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

  it('calculates allocation deltas within enabled target groups', () => {
    const allocation = (
      service as unknown as {
        buildAllocationSnapshot: (input: {
          assets: Record<string, unknown>[];
          reportingCurrency: string;
          portfolioTotal: number;
          assetKindTargets: Array<{
            kind: AssetKind;
            targetPercent: Prisma.Decimal;
          }>;
          securityTargets: Array<{
            kind: AssetKind;
            ticker: string;
            exchange: string;
            name: string | null;
            targetPercent: Prisma.Decimal;
          }>;
        }) => {
          assetKindTargets: Array<{
            key: string;
            currentPercent: number | null;
            targetPercent: number | null;
            deltaPercent: number | null;
            deltaValue: number | null;
          }>;
          securityTargets: Array<{
            key: string;
            currentPercent: number | null;
            targetPercent: number | null;
            deltaPercent: number | null;
            deltaValue: number | null;
          }>;
        };
      }
    ).buildAllocationSnapshot({
      assets: [
        createDashboardAsset({
          id: 'cash-1',
          kind: AssetKind.CASH,
          ticker: null,
          exchange: null,
          quantity: null,
          currentValue: 900,
          referenceValue: 900,
        }),
        createDashboardAsset({
          id: 'other-1',
          kind: AssetKind.OTHER,
          ticker: null,
          exchange: null,
          quantity: null,
          currentValue: 50,
          referenceValue: 50,
        }),
        createDashboardAsset({
          id: 'stock-1',
          name: 'A fund',
          ticker: 'AAA',
          exchange: 'XETRA',
          kind: AssetKind.STOCK,
          quantity: 1,
          currentValue: 30,
          referenceValue: 30,
        }),
        createDashboardAsset({
          id: 'stock-2',
          name: 'B fund',
          ticker: 'BBB',
          exchange: 'XETRA',
          kind: AssetKind.STOCK,
          quantity: 1,
          currentValue: 20,
          referenceValue: 20,
        }),
      ],
      reportingCurrency: 'EUR',
      portfolioTotal: 1000,
      assetKindTargets: [
        { kind: AssetKind.STOCK, targetPercent: new Prisma.Decimal(100) },
      ],
      securityTargets: [
        {
          kind: AssetKind.STOCK,
          ticker: 'AAA',
          exchange: 'XETRA',
          name: 'A fund',
          targetPercent: new Prisma.Decimal(60),
        },
        {
          kind: AssetKind.STOCK,
          ticker: 'BBB',
          exchange: 'XETRA',
          name: 'B fund',
          targetPercent: new Prisma.Decimal(40),
        },
      ],
    });

    const stockRow = allocation.assetKindTargets.find(
      (row) => row.key === AssetKind.STOCK,
    );
    const cashRow = allocation.assetKindTargets.find(
      (row) => row.key === AssetKind.CASH,
    );
    const firstSecurity = allocation.securityTargets.find((row) =>
      row.key.includes('AAA'),
    );
    const secondSecurity = allocation.securityTargets.find((row) =>
      row.key.includes('BBB'),
    );

    expect(cashRow?.currentPercent).toBe(90);
    expect(cashRow?.targetPercent).toBeNull();
    expect(stockRow?.currentPercent).toBe(100);
    expect(stockRow?.deltaPercent).toBe(0);
    expect(stockRow?.deltaValue).toBe(0);
    expect(firstSecurity?.currentPercent).toBe(60);
    expect(firstSecurity?.deltaPercent).toBe(0);
    expect(secondSecurity?.currentPercent).toBe(40);
    expect(secondSecurity?.deltaPercent).toBe(0);
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

    it('neutralises a quantity step around a mid-range BUY', async () => {
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
          createdAt: new Date(tEarly - 1000),
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
          unitPrice: new Prisma.Decimal('100'),
          grossAmount: new Prisma.Decimal('500'),
          feeAmount: new Prisma.Decimal('0'),
          currency: 'EUR',
          cashAmount: new Prisma.Decimal('-500'),
        },
      ]);

      const result = await service.getPerformance(OWNER_ID, 'account-1', '1Y');

      const earlyPoint = result.points.find((point) => point.t === tEarly);
      const buyPoint = result.points.find((point) => point.t === buyPostedAt);
      const latePoint = result.points.find((point) => point.t === tLate);

      expect(earlyPoint?.value).toBe(1000);
      expect(buyPoint?.value).toBe(1000);
      expect(latePoint?.value).toBe(1100);
      expect(result.changeAbsolute).toBe(100);
      expect(result.changePercent).toBe(10);
    });

    it('normalises long-range performance for buys inside the selected range', async () => {
      const fixedNow = new Date('2026-06-14T10:00:00.000Z');
      const tEarly = Date.UTC(2026, 4, 15, 10, 0);
      const buyPostedAt = new Date('2026-06-03T10:00:00.000Z');
      const tLate = Date.UTC(2026, 5, 12, 10, 0);

      jest.useFakeTimers();
      jest.setSystemTime(fixedNow);

      try {
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
                currentValue: 1100,
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
            createdAt: new Date('2026-04-01T10:00:00.000Z'),
          }),
        ]);
        prices.getMarketSeries.mockResolvedValue({
          points: [
            { t: tEarly, price: 100 },
            { t: buyPostedAt.getTime(), price: 100 },
            { t: tLate, price: 110 },
          ],
          previousClose: null,
          latestPrice: 110,
        });
        prisma.brokerageOperation.findMany.mockResolvedValue([
          {
            id: 'op-1',
            assetId: 'asset-1',
            kind: BrokerageOperationKind.BUY,
            postedAt: buyPostedAt,
            quantity: new Prisma.Decimal('5'),
            currency: 'EUR',
            cashAmount: new Prisma.Decimal('-500'),
          },
        ]);

        const result = await service.getPerformance(
          OWNER_ID,
          'account-1',
          '1M',
        );
        const buyPoint = result.points.find(
          (point) => point.t === buyPostedAt.getTime(),
        );

        expect(result.points[0]?.value).toBe(1000);
        expect(buyPoint?.value).toBe(1000);
        expect(result.latestValue).toBe(1100);
        expect(result.baselineValue).toBe(1000);
        expect(result.changeAbsolute).toBe(100);
        expect(result.changePercent).toBe(10);
      } finally {
        jest.useRealTimers();
      }
    });

    it('normalises buy performance when legacy rows have a zero cash amount', async () => {
      const fixedNow = new Date('2026-06-14T10:00:00.000Z');
      const tEarly = Date.UTC(2026, 4, 15, 10, 0);
      const buyPostedAt = new Date('2026-06-03T10:00:00.000Z');
      const tLate = Date.UTC(2026, 5, 12, 10, 0);

      jest.useFakeTimers();
      jest.setSystemTime(fixedNow);

      try {
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
                currentValue: 1100,
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
            createdAt: new Date('2026-04-01T10:00:00.000Z'),
          }),
        ]);
        prices.getMarketSeries.mockResolvedValue({
          points: [
            { t: tEarly, price: 100 },
            { t: buyPostedAt.getTime(), price: 100 },
            { t: tLate, price: 110 },
          ],
          previousClose: null,
          latestPrice: 110,
        });
        prisma.brokerageOperation.findMany.mockResolvedValue([
          {
            id: 'op-1',
            assetId: 'asset-1',
            kind: BrokerageOperationKind.BUY,
            postedAt: buyPostedAt,
            quantity: new Prisma.Decimal('5'),
            unitPrice: new Prisma.Decimal('100'),
            grossAmount: new Prisma.Decimal('500'),
            feeAmount: new Prisma.Decimal('0'),
            currency: 'EUR',
            cashAmount: new Prisma.Decimal('0'),
          },
        ]);

        const result = await service.getPerformance(
          OWNER_ID,
          'account-1',
          '1M',
        );

        expect(result.latestValue).toBe(1100);
        expect(result.baselineValue).toBe(1000);
        expect(result.changeAbsolute).toBe(100);
        expect(result.changePercent).toBe(10);
      } finally {
        jest.useRealTimers();
      }
    });

    it('weights portfolio returns from the moment a new position is bought', async () => {
      const fixedNow = new Date('2026-06-14T10:00:00.000Z');
      const tEarly = Date.UTC(2026, 4, 15, 10, 0);
      const buyPostedAt = new Date('2026-06-03T10:00:00.000Z');
      const tLate = Date.UTC(2026, 5, 12, 10, 0);

      jest.useFakeTimers();
      jest.setSystemTime(fixedNow);

      try {
        prisma.account.findFirst.mockResolvedValue(
          createAccount({ currency: 'EUR' }),
        );
        assets.getDashboard.mockResolvedValue(
          createDashboard({
            reportingCurrency: 'EUR',
            assets: [
              createDashboardAsset({
                id: 'asset-a',
                name: 'First position',
                ticker: 'AAA',
                currency: 'EUR',
                quantity: 1,
                currentValue: 20,
                referenceValue: 10,
              }),
              createDashboardAsset({
                id: 'asset-b',
                name: 'Second position',
                ticker: 'BBB',
                currency: 'EUR',
                quantity: 1,
                currentValue: 11,
                referenceValue: 10,
              }),
            ],
          }),
        );
        prisma.asset.findMany.mockResolvedValue([
          createAsset({
            id: 'asset-a',
            name: 'First position',
            ticker: 'AAA',
            currency: 'EUR',
            quantity: new Prisma.Decimal('1'),
            balance: new Prisma.Decimal('10'),
            createdAt: new Date('2026-04-01T10:00:00.000Z'),
          }),
          createAsset({
            id: 'asset-b',
            name: 'Second position',
            ticker: 'BBB',
            currency: 'EUR',
            quantity: new Prisma.Decimal('1'),
            balance: new Prisma.Decimal('10'),
            createdAt: buyPostedAt,
          }),
        ]);
        prices.getMarketSeries
          .mockResolvedValueOnce({
            points: [
              { t: tEarly, price: 10 },
              { t: buyPostedAt.getTime(), price: 20 },
              { t: tLate, price: 20 },
            ],
            previousClose: null,
            latestPrice: 20,
          })
          .mockResolvedValueOnce({
            points: [
              { t: buyPostedAt.getTime(), price: 10 },
              { t: tLate, price: 11 },
            ],
            previousClose: null,
            latestPrice: 11,
          });
        prisma.brokerageOperation.findMany.mockResolvedValue([
          {
            id: 'op-1',
            assetId: 'asset-b',
            kind: BrokerageOperationKind.BUY,
            postedAt: buyPostedAt,
            quantity: new Prisma.Decimal('1'),
            unitPrice: new Prisma.Decimal('10'),
            grossAmount: new Prisma.Decimal('10'),
            feeAmount: new Prisma.Decimal('0'),
            currency: 'EUR',
            cashAmount: new Prisma.Decimal('-10'),
          },
        ]);

        const result = await service.getPerformance(
          OWNER_ID,
          'account-1',
          '1M',
        );

        expect(result.latestValue).toBe(31);
        expect(result.changeAbsolute).toBe(11);
        expect(result.baselineValue).toBe(15);
        expect(result.changePercent).toBe(106.67);
      } finally {
        jest.useRealTimers();
      }
    });

    it('normalises long-range performance when a position appears without a recorded buy', async () => {
      const fixedNow = new Date('2026-06-14T10:00:00.000Z');
      const tEarly = Date.UTC(2026, 4, 15, 10, 0);
      const positionStartedAt = new Date('2026-06-03T10:00:00.000Z');
      const tLate = Date.UTC(2026, 5, 12, 10, 0);

      jest.useFakeTimers();
      jest.setSystemTime(fixedNow);

      try {
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
                currentValue: 1100,
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
            balance: new Prisma.Decimal('1000'),
            createdAt: positionStartedAt,
          }),
        ]);
        prices.getMarketSeries.mockResolvedValue({
          points: [
            { t: tEarly, price: 100 },
            { t: positionStartedAt.getTime(), price: 100 },
            { t: tLate, price: 110 },
          ],
          previousClose: null,
          latestPrice: 110,
        });
        prisma.brokerageOperation.findMany.mockResolvedValue([]);

        const result = await service.getPerformance(
          OWNER_ID,
          'account-1',
          '1M',
        );
        const exposurePoint = result.points.find(
          (point) => point.t === positionStartedAt.getTime(),
        );

        expect(result.points[0]?.value).toBe(1000);
        expect(exposurePoint?.value).toBe(1000);
        expect(result.latestValue).toBe(1100);
        expect(result.baselineValue).toBe(1000);
        expect(result.changeAbsolute).toBe(100);
        expect(result.changePercent).toBe(10);
      } finally {
        jest.useRealTimers();
      }
    });

    it('uses cost basis before the first market quote for imported holdings without buy history', async () => {
      const fixedNow = new Date('2026-06-14T10:00:00.000Z');
      const accountStartedAt = new Date('2025-10-03T10:00:00.000Z');
      const firstProviderPoint = Date.UTC(2026, 5, 3, 10, 0);
      const tLate = Date.UTC(2026, 5, 12, 10, 0);

      jest.useFakeTimers();
      jest.setSystemTime(fixedNow);

      try {
        prisma.account.findFirst.mockResolvedValue(
          createAccount({ currency: 'EUR', createdAt: fixedNow }),
        );
        prisma.transaction.findFirst.mockResolvedValue({
          postedAt: accountStartedAt,
        });
        assets.getDashboard.mockResolvedValue(
          createDashboard({
            reportingCurrency: 'EUR',
            assets: [
              createDashboardAsset({
                id: 'asset-1',
                currency: 'EUR',
                quantity: 10,
                currentValue: 1137,
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
            balance: new Prisma.Decimal('1000'),
            createdAt: fixedNow,
            importSource: ImportSource.CSV_TEMPLATE,
          }),
        ]);
        prices.getMarketSeries.mockResolvedValue({
          points: [
            { t: firstProviderPoint, price: 106 },
            { t: tLate, price: 113.7 },
          ],
          previousClose: null,
          latestPrice: 113.7,
        });
        prisma.brokerageOperation.findMany.mockResolvedValue([]);

        const result = await service.getPerformance(
          OWNER_ID,
          'account-1',
          'MAX',
        );

        expect(result.points[0]).toEqual({
          t: accountStartedAt.getTime(),
          value: 1000,
        });
        expect(result.latestValue).toBe(1137);
        expect(result.baselineValue).toBe(1000);
        expect(result.changeAbsolute).toBe(137);
        expect(result.changePercent).toBe(13.7);
      } finally {
        jest.useRealTimers();
      }
    });

    it('uses cost basis before market quotes for imported holdings with later buys', async () => {
      const fixedNow = new Date('2026-06-14T10:00:00.000Z');
      const accountStartedAt = new Date('2025-10-03T10:00:00.000Z');
      const buyPostedAt = new Date('2026-06-03T10:00:00.000Z');
      const tLate = Date.UTC(2026, 5, 12, 10, 0);

      jest.useFakeTimers();
      jest.setSystemTime(fixedNow);

      try {
        prisma.account.findFirst.mockResolvedValue(
          createAccount({ currency: 'EUR', createdAt: fixedNow }),
        );
        prisma.transaction.findFirst.mockResolvedValue({
          postedAt: accountStartedAt,
        });
        assets.getDashboard.mockResolvedValue(
          createDashboard({
            reportingCurrency: 'EUR',
            assets: [
              createDashboardAsset({
                id: 'asset-1',
                currency: 'EUR',
                quantity: 10,
                currentValue: 1100,
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
            balance: new Prisma.Decimal('1000'),
            createdAt: fixedNow,
            importSource: ImportSource.CSV_TEMPLATE,
          }),
        ]);
        prices.getMarketSeries.mockResolvedValue({
          points: [
            { t: buyPostedAt.getTime(), price: 110 },
            { t: tLate, price: 110 },
          ],
          previousClose: null,
          latestPrice: 110,
        });
        prisma.brokerageOperation.findMany.mockResolvedValue([
          {
            id: 'op-1',
            assetId: 'asset-1',
            kind: BrokerageOperationKind.BUY,
            postedAt: buyPostedAt,
            quantity: new Prisma.Decimal('5'),
            unitPrice: new Prisma.Decimal('100'),
            grossAmount: new Prisma.Decimal('500'),
            feeAmount: new Prisma.Decimal('0'),
            currency: 'EUR',
            cashAmount: new Prisma.Decimal('-500'),
          },
        ]);

        const result = await service.getPerformance(
          OWNER_ID,
          'account-1',
          'MAX',
        );

        expect(result.points[0]).toEqual({
          t: accountStartedAt.getTime(),
          value: 1000,
        });
        expect(result.latestValue).toBe(1100);
        expect(result.baselineValue).toBe(1000);
        expect(result.changeAbsolute).toBe(100);
        expect(result.changePercent).toBe(10);
      } finally {
        jest.useRealTimers();
      }
    });

    it('clips 1Y imported holdings to the first known brokerage activity', async () => {
      const fixedNow = new Date('2026-06-14T10:00:00.000Z');
      const accountStartedAt = new Date('2025-10-03T10:00:00.000Z');
      const tBeforeAccount = Date.UTC(2025, 8, 1, 10, 0);
      const tMid = Date.UTC(2026, 0, 15, 10, 0);

      jest.useFakeTimers();
      jest.setSystemTime(fixedNow);

      try {
        prisma.account.findFirst.mockResolvedValue(
          createAccount({ currency: 'EUR', createdAt: fixedNow }),
        );
        prisma.transaction.findFirst.mockResolvedValue({
          postedAt: accountStartedAt,
        });
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
            balance: new Prisma.Decimal('1000'),
            createdAt: fixedNow,
            importSource: ImportSource.CSV_TEMPLATE,
          }),
        ]);
        prices.getMarketSeries.mockResolvedValue({
          points: [
            { t: tBeforeAccount, price: 80 },
            { t: accountStartedAt.getTime(), price: 100 },
            { t: tMid, price: 110 },
          ],
          previousClose: null,
          latestPrice: 110,
        });
        prisma.brokerageOperation.findMany.mockResolvedValue([]);

        const result = await service.getPerformance(
          OWNER_ID,
          'account-1',
          '1Y',
        );

        expect(result.points[0]).toEqual({
          t: accountStartedAt.getTime(),
          value: 1000,
        });
        expect(
          result.points.some((point) => point.t < accountStartedAt.getTime()),
        ).toBe(false);
        expect(result.baselineValue).toBe(1000);
        expect(result.latestValue).toBe(1234);
        expect(result.changeAbsolute).toBe(234);
        expect(result.changePercent).toBe(23.4);
      } finally {
        jest.useRealTimers();
      }
    });

    it('starts MAX performance at the first BUY when the account begins empty', async () => {
      const fixedNow = new Date('2026-06-14T10:00:00.000Z');
      const accountStartedAt = new Date('2025-10-03T10:00:00.000Z');
      const buyPostedAt = new Date('2025-11-07T10:00:00.000Z');
      const tMid = Date.UTC(2026, 0, 15, 10, 0);

      jest.useFakeTimers();
      jest.setSystemTime(fixedNow);

      try {
        prisma.account.findFirst.mockResolvedValue(
          createAccount({ currency: 'EUR', createdAt: fixedNow }),
        );
        prisma.transaction.findFirst.mockResolvedValue({
          postedAt: accountStartedAt,
        });
        assets.getDashboard.mockResolvedValue(
          createDashboard({
            reportingCurrency: 'EUR',
            assets: [
              createDashboardAsset({
                id: 'asset-1',
                currency: 'EUR',
                quantity: 10,
                currentValue: 1250,
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
            createdAt: fixedNow,
          }),
        ]);
        prices.getMarketSeries.mockResolvedValue({
          points: [
            { t: accountStartedAt.getTime(), price: 90 },
            { t: buyPostedAt.getTime(), price: 100 },
            { t: tMid, price: 110 },
          ],
          previousClose: null,
          latestPrice: 110,
        });
        prisma.brokerageOperation.findMany.mockResolvedValue([
          {
            id: 'op-1',
            assetId: 'asset-1',
            kind: BrokerageOperationKind.BUY,
            postedAt: buyPostedAt,
            quantity: new Prisma.Decimal('10'),
            unitPrice: new Prisma.Decimal('100'),
            grossAmount: new Prisma.Decimal('1000'),
            feeAmount: new Prisma.Decimal('0'),
            currency: 'EUR',
            cashAmount: new Prisma.Decimal('-1000'),
          },
        ]);

        const result = await service.getPerformance(
          OWNER_ID,
          'account-1',
          'MAX',
        );
        const firstPoint = result.points[0];
        const buyPoint = result.points.find(
          (point) => point.t === buyPostedAt.getTime(),
        );

        expect(firstPoint).toEqual({
          t: buyPostedAt.getTime(),
          value: 1000,
        });
        expect(buyPoint?.value).toBe(1000);
        expect(
          result.points.some((point) => point.t < buyPostedAt.getTime()),
        ).toBe(false);
        expect(result.baselineValue).toBe(1000);
        expect(result.latestValue).toBe(1250);
        expect(result.changeAbsolute).toBe(250);
        expect(result.changePercent).toBe(25);
      } finally {
        jest.useRealTimers();
      }
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

    it('anchors long-range performance at the current stored dashboard value', async () => {
      const fixedNow = new Date('2026-06-13T10:00:00.000Z');
      const tOld = Date.UTC(2026, 0, 13, 10, 0);

      jest.useFakeTimers();
      jest.setSystemTime(fixedNow);

      try {
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
            createdAt: new Date('2025-01-13T10:00:00.000Z'),
          }),
        ]);
        prices.getMarketSeries.mockResolvedValue({
          points: [{ t: tOld, price: 90 }],
          previousClose: 88,
          latestPrice: 90,
        });
        prisma.brokerageOperation.findMany.mockResolvedValue([]);

        const result = await service.getPerformance(
          OWNER_ID,
          'account-1',
          '1Y',
        );
        const latestPoint = result.points[result.points.length - 1];

        expect(latestPoint).toEqual({
          t: fixedNow.getTime(),
          value: 1234,
        });
        expect(result.latestValue).toBe(1234);
      } finally {
        jest.useRealTimers();
      }
    });

    it('returns an empty partial MAX chart when historical series fetching fails', async () => {
      const fixedNow = new Date('2026-06-13T10:00:00.000Z');
      const createdAt = new Date('2025-02-01T10:00:00.000Z');

      jest.useFakeTimers();
      jest.setSystemTime(fixedNow);

      try {
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
            createdAt,
          }),
        ]);
        prices.getMarketSeries.mockResolvedValue(null);
        prisma.brokerageOperation.findMany.mockResolvedValue([]);

        const result = await service.getPerformance(
          OWNER_ID,
          'account-1',
          'MAX',
        );

        expect(result.points).toEqual([]);
        expect(result.baselineValue).toBeNull();
        expect(result.latestValue).toBeNull();
        expect(result.changeAbsolute).toBeNull();
        expect(result.changePercent).toBeNull();
        expect(result.pricingStatus.state).toBe('PARTIAL');
      } finally {
        jest.useRealTimers();
      }
    });

    it('returns an empty partial chart when every price series fails', async () => {
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
      expect(result.points).toEqual([]);
      expect(result.baselineValue).toBeNull();
      expect(result.latestValue).toBeNull();
      expect(result.changeAbsolute).toBeNull();
      expect(result.changePercent).toBeNull();
    });

    it('returns an empty fresh chart when positions have no tickers to reconstruct', async () => {
      prisma.account.findFirst.mockResolvedValue(
        createAccount({ currency: 'EUR' }),
      );
      assets.getDashboard.mockResolvedValue(
        createDashboard({
          reportingCurrency: 'EUR',
          assets: [
            createDashboardAsset({
              id: 'asset-1',
              ticker: null,
              exchange: null,
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
          ticker: null,
          exchange: null,
          currency: 'EUR',
          quantity: new Prisma.Decimal('10'),
        }),
      ]);

      const result = await service.getPerformance(OWNER_ID, 'account-1', '1Y');

      expect(prices.getMarketSeries).not.toHaveBeenCalled();
      expect(result.pricingStatus.state).toBe('FRESH');
      expect(result.points).toEqual([]);
      expect(result.baselineValue).toBeNull();
      expect(result.latestValue).toBeNull();
      expect(result.changePercent).toBeNull();
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
              currentValue: 1050,
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
