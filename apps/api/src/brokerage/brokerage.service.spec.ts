import { BadRequestException } from '@nestjs/common';
import { BrokerageService } from '@brokerage/brokerage.service';
import { AccountType, AssetKind, AssetType, Prisma } from '@finhance/db';

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

describe('BrokerageService', () => {
  let service: BrokerageService;
  let prisma: {
    $transaction: jest.Mock;
    account: {
      findFirst: jest.Mock;
    };
    asset: {
      findFirst: jest.Mock;
      update: jest.Mock;
      create: jest.Mock;
    };
    brokerageOperation: {
      create: jest.Mock;
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
        update: jest.fn(),
        create: jest.fn(),
      },
      brokerageOperation: {
        create: jest.fn(),
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
    transactions = {
      applyAccountCashMovement: jest.fn(),
      create: jest.fn(),
    };

    service = new BrokerageService(
      prisma as never,
      accounts as never,
      {} as never,
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
            exchange: 'nasdaq',
            targetPercent: 60,
          },
          {
            kind: AssetKind.STOCK,
            ticker: 'AAPL',
            exchange: 'NASDAQ',
            targetPercent: 40,
          },
        ],
      }),
    ).rejects.toThrow(
      new BadRequestException(
        'Duplicate security targets are not allowed: STOCK:AAPL:NASDAQ.',
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
      async (args: { data: Record<string, unknown> }) => ({
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
      }),
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

    expect(prisma.brokerageOperation.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        currency: 'USD',
      }),
    });
  });
});
