import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validateSync, type ValidationError } from 'class-validator';
import { AssetKind } from '@finhance/db';
import { BrokeragePerformanceQueryDto } from '@brokerage/dto/brokerage-performance-query.dto';
import { CreateBrokerageBuyDto } from '@brokerage/dto/create-brokerage-buy.dto';
import { CreateBrokerageSellDto } from '@brokerage/dto/create-brokerage-sell.dto';
import { UpdateBrokerageTradeDto } from '@brokerage/dto/update-brokerage-trade.dto';
import { UpdatePortfolioAllocationTargetsDto } from '@brokerage/dto/update-portfolio-allocation-targets.dto';

function collectConstraintMessages(errors: ValidationError[]): string[] {
  return errors.flatMap((error) => [
    ...Object.values(error.constraints ?? {}),
    ...collectConstraintMessages(error.children ?? []),
  ]);
}

describe('Brokerage DTO validation', () => {
  it('rejects oversized market symbols on buy requests', () => {
    const dto = plainToInstance(CreateBrokerageBuyDto, {
      kind: AssetKind.STOCK,
      currency: 'usd',
      quantity: 1,
      unitPrice: 10,
      postedAt: '2026-05-20T10:00:00.000Z',
      ticker: 'A'.repeat(33),
      exchange: 'X'.repeat(25),
    });

    const messages = collectConstraintMessages(validateSync(dto));
    expect(messages).toEqual(
      expect.arrayContaining([
        'ticker must be shorter than or equal to 32 characters',
        'exchange must be shorter than or equal to 24 characters',
      ]),
    );
  });

  it('allows zero fees on trade create and correction requests', () => {
    const requests = [
      plainToInstance(CreateBrokerageBuyDto, {
        kind: AssetKind.STOCK,
        currency: 'EUR',
        quantity: 1,
        unitPrice: 10,
        feeAmount: 0,
        postedAt: '2026-05-20T10:00:00.000Z',
      }),
      plainToInstance(CreateBrokerageSellDto, {
        assetId: 'asset-1',
        quantity: 1,
        unitPrice: 10,
        feeAmount: 0,
        postedAt: '2026-05-20T10:00:00.000Z',
      }),
      plainToInstance(UpdateBrokerageTradeDto, {
        quantity: 1,
        unitPrice: 10,
        feeAmount: 0,
        postedAt: '2026-05-20T10:00:00.000Z',
      }),
    ];

    for (const request of requests) {
      expect(collectConstraintMessages(validateSync(request))).toEqual([]);
    }
  });

  it('accepts a valid performance range', () => {
    const dto = plainToInstance(BrokeragePerformanceQueryDto, { range: '1W' });

    expect(collectConstraintMessages(validateSync(dto))).toEqual([]);
    expect(dto.range).toBe('1W');
  });

  it('allows an absent performance range', () => {
    const dto = plainToInstance(BrokeragePerformanceQueryDto, {});

    expect(collectConstraintMessages(validateSync(dto))).toEqual([]);
    expect(dto.range).toBeUndefined();
  });

  it('rejects an invalid performance range', () => {
    const dto = plainToInstance(BrokeragePerformanceQueryDto, {
      range: '3M',
    });

    const messages = collectConstraintMessages(validateSync(dto));
    expect(messages).toEqual(
      expect.arrayContaining([
        'range must be one of the following values: 1D, 1W, 1M, 1Y, MAX',
      ]),
    );
  });

  it('rejects invalid exchange characters in allocation targets', () => {
    const dto = plainToInstance(UpdatePortfolioAllocationTargetsDto, {
      assetKindTargets: [],
      securityTargets: [
        {
          kind: AssetKind.STOCK,
          ticker: 'AAPL',
          exchange: 'NASDAQ!',
          targetPercent: 100,
        },
      ],
    });

    const messages = collectConstraintMessages(validateSync(dto));
    expect(messages).toEqual(
      expect.arrayContaining([
        'exchange must match /^[A-Z0-9.=-]+$/ regular expression',
      ]),
    );
  });
});
