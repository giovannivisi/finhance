import { BadRequestException } from '@nestjs/common';
import { BrokerageService } from '@brokerage/brokerage.service';
import { AssetKind } from '@finhance/db';

describe('BrokerageService', () => {
  let service: BrokerageService;
  let prisma: {
    $transaction: jest.Mock;
    portfolioAssetKindTarget: {
      deleteMany: jest.Mock;
      createMany: jest.Mock;
    };
    portfolioSecurityTarget: {
      deleteMany: jest.Mock;
      createMany: jest.Mock;
    };
  };

  beforeEach(() => {
    prisma = {
      $transaction: jest.fn(),
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

    service = new BrokerageService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
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
});
