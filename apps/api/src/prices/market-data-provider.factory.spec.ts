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

  it('creates the hybrid provider when both listed-security keys are configured', () => {
    const provider = createMarketDataProvider({
      MARKET_DATA_PROVIDER: ' Hybrid ',
      EODHD_API_TOKEN: ' eodhd-token ',
      MARKETSTACK_API_KEY: ' test-key ',
    } as NodeJS.ProcessEnv);

    expect(provider.id).toBe('hybrid');
  });

  it('fails fast when the hybrid provider is missing either API credential', () => {
    expect(() =>
      createMarketDataProvider({
        MARKET_DATA_PROVIDER: 'hybrid',
        MARKETSTACK_API_KEY: 'test-key',
      } as NodeJS.ProcessEnv),
    ).toThrow(
      'EODHD_API_TOKEN and MARKETSTACK_API_KEY are required when MARKET_DATA_PROVIDER=hybrid.',
    );
  });

  it('fails fast for unsupported providers', () => {
    expect(() =>
      resolveMarketDataProviderName({
        MARKET_DATA_PROVIDER: 'unknown',
      } as NodeJS.ProcessEnv),
    ).toThrow(
      'Unsupported MARKET_DATA_PROVIDER "unknown". Supported values: hybrid, yahoo.',
    );
  });
});
