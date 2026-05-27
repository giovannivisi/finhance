import { AssetKind } from '@finhance/db';
import { PricesService } from '@prices/prices.service';

describe('PricesService', () => {
  let service: PricesService;
  let prisma: {
    fxRate: {
      findUnique: jest.Mock;
      findFirst: jest.Mock;
      upsert: jest.Mock;
    };
  };

  beforeEach(() => {
    prisma = {
      fxRate: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        upsert: jest.fn(),
      },
    };
    service = new PricesService(prisma as never);
  });

  it('normalizes crypto symbols to a Yahoo pair', () => {
    expect(
      service.buildMarketSymbol({
        kind: AssetKind.CRYPTO,
        ticker: 'btc',
        exchange: '_CRYPTO_',
        quoteCurrency: 'usd',
      }),
    ).toBe('BTC-USD');
  });

  it('normalizes stock symbols with exchange suffixes', () => {
    expect(
      service.buildMarketSymbol({
        kind: AssetKind.STOCK,
        ticker: 'enel',
        exchange: '.mi',
        quoteCurrency: 'eur',
      }),
    ).toBe('ENEL.MI');
  });

  it('rejects unsupported currency codes', () => {
    expect(() => service.normalizeCurrency('EURO')).toThrow(
      'Unsupported currency code "EURO".',
    );
  });

  it('returns an exact stored FX rate when today is already persisted', async () => {
    const updatedAt = new Date('2026-05-27T10:00:00.000Z');
    prisma.fxRate.findUnique.mockResolvedValue({
      rate: { toString: () => '0.91' },
      rateDate: new Date('2026-05-27T00:00:00.000Z'),
      updatedAt,
    });

    const result = await service.getStoredFxRateSnapshot(
      'local-dev',
      new Date('2026-05-27T12:00:00.000Z'),
      'USD',
      'EUR',
    );

    expect(result.status).toBe('EXACT');
    expect(result.rate?.toString()).toBe('0.91');
    expect(result.updatedAt).toEqual(updatedAt);
    expect(prisma.fxRate.findFirst).not.toHaveBeenCalled();
  });

  it('falls back to the latest stored FX rate when today is missing', async () => {
    const updatedAt = new Date('2026-05-26T18:00:00.000Z');
    prisma.fxRate.findUnique.mockResolvedValue(null);
    prisma.fxRate.findFirst.mockResolvedValue({
      rate: { toString: () => '0.89' },
      rateDate: new Date('2026-05-26T00:00:00.000Z'),
      updatedAt,
    });

    const result = await service.getStoredFxRateSnapshot(
      'local-dev',
      new Date('2026-05-27T12:00:00.000Z'),
      'USD',
      'EUR',
    );

    expect(result.status).toBe('STALE');
    expect(result.rate?.toString()).toBe('0.89');
    expect(result.updatedAt).toEqual(updatedAt);
  });

  it('reports missing when no stored FX rate exists', async () => {
    prisma.fxRate.findUnique.mockResolvedValue(null);
    prisma.fxRate.findFirst.mockResolvedValue(null);

    const result = await service.getStoredFxRateSnapshot(
      'local-dev',
      new Date('2026-05-27T12:00:00.000Z'),
      'USD',
      'EUR',
    );

    expect(result).toEqual({
      rate: null,
      status: 'MISSING',
      rateDate: null,
      updatedAt: null,
    });
  });
});
