import { AssetKind } from '@prisma/client';
import { PricesService } from '@prices/prices.service';

describe('PricesService', () => {
  let service: PricesService;

  beforeEach(() => {
    service = new PricesService();
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
});
