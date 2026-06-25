import {
  createMarketDataProvider,
  resolveMarketDataProviderName,
} from '@prices/market-data-provider.factory';

describe('market data provider factory', () => {
  it('defaults to Yahoo when no provider is configured', () => {
    expect(resolveMarketDataProviderName({} as NodeJS.ProcessEnv)).toBe(
      'yahoo',
    );
    expect(createMarketDataProvider({} as NodeJS.ProcessEnv).id).toBe('yahoo');
  });

  it('normalises an explicit Yahoo provider setting', () => {
    expect(
      resolveMarketDataProviderName({
        MARKET_DATA_PROVIDER: ' Yahoo ',
      } as NodeJS.ProcessEnv),
    ).toBe('yahoo');
  });

  it('fails fast for unsupported providers', () => {
    expect(() =>
      resolveMarketDataProviderName({
        MARKET_DATA_PROVIDER: 'unknown',
      } as NodeJS.ProcessEnv),
    ).toThrow(
      'Unsupported MARKET_DATA_PROVIDER "unknown". Supported values: yahoo.',
    );
  });
});
