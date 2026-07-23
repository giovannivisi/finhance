import { AssetKind } from '@finhance/db';
import { SUPPORTED_EXCHANGES } from '@/common/catalogues';
import { HybridMarketDataProvider } from '@prices/hybrid-market-data.provider';

describe('HybridMarketDataProvider', () => {
  const provider = new HybridMarketDataProvider({
    eodhdApiToken: 'eodhd-token',
    marketstackApiKey: 'marketstack-key',
  });

  it('routes both issue #90 listings to providers that cover the exact exchange', () => {
    expect(
      provider.buildMarketSymbol({
        kind: AssetKind.STOCK,
        ticker: 'CSSPX',
        exchange: '.MI',
        quoteCurrency: 'EUR',
      }),
    ).toBe('marketstack:CSSPX@XMIL');
    expect(
      provider.buildMarketSymbol({
        kind: AssetKind.STOCK,
        ticker: 'VWCE',
        exchange: '.HM',
        quoteCurrency: 'EUR',
      }),
    ).toBe('eodhd:VWCE.XETRA');
  });

  it('has a route for every exchange in the application catalogue', () => {
    for (const exchange of SUPPORTED_EXCHANGES) {
      const kind =
        exchange.value === '_CRYPTO_' ? AssetKind.CRYPTO : AssetKind.STOCK;
      expect(() =>
        provider.buildMarketSymbol({
          kind,
          ticker: kind === AssetKind.CRYPTO ? 'BTC' : 'TEST',
          exchange: exchange.value,
          quoteCurrency: kind === AssetKind.CRYPTO ? 'USD' : 'EUR',
        }),
      ).not.toThrow();
    }
  });

  it('uses complementary global routes instead of a two-exchange special case', () => {
    expect(
      provider.buildMarketSymbol({
        kind: AssetKind.STOCK,
        ticker: 'VUSD',
        exchange: '.L',
        quoteCurrency: 'GBP',
      }),
    ).toBe('marketstack:VUSD@XLON');
    expect(
      provider.buildMarketSymbol({
        kind: AssetKind.STOCK,
        ticker: 'BHP',
        exchange: '.AX',
        quoteCurrency: 'AUD',
      }),
    ).toBe('eodhd:BHP.AU');
    expect(
      provider.buildMarketSymbol({
        kind: AssetKind.STOCK,
        ticker: '7203',
        exchange: '.T',
        quoteCurrency: 'JPY',
      }),
    ).toBe('yahoo:7203.T');
  });

  it('routes crypto and FX through the separately isolated Yahoo adapter', () => {
    expect(
      provider.buildMarketSymbol({
        kind: AssetKind.CRYPTO,
        ticker: 'BTC-EUR',
        exchange: '_CRYPTO_',
        quoteCurrency: 'EUR',
      }),
    ).toBe('yahoo:BTC-EUR');
    expect(provider.buildFxSymbol('USD', 'EUR')).toBe('yahoo:USDEUR=X');
  });

  it('falls back to Yahoo only after a native listing cannot be resolved', () => {
    expect(
      provider.getMarketSymbolCandidates({
        kind: AssetKind.STOCK,
        ticker: 'VWCE',
        exchange: '.HM',
        quoteCurrency: 'EUR',
      }),
    ).toEqual(['eodhd:VWCE.XETRA', 'yahoo:VWCE.HM']);
  });

  it('uses independent request groups and provider names', () => {
    expect(provider.getRequestGroup('marketstack:CSSPX@XMIL')).toBe(
      'marketstack',
    );
    expect(provider.getRequestGroup('eodhd:VWCE.XETRA')).toBe('eodhd');
    expect(provider.getRequestGroup('yahoo:USDEUR=X')).toBe('yahoo');
    expect(provider.getDisplayName('marketstack:CSSPX@XMIL')).toBe(
      'Marketstack',
    );
    expect(provider.getDisplayName('eodhd:VWCE.XETRA')).toBe('EODHD');
    expect(provider.getDisplayName('yahoo:USDEUR=X')).toBe('Yahoo Finance');
  });
});
