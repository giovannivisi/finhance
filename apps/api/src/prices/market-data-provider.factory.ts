import type { MarketDataProvider } from '@prices/market-data-provider';
import { HybridMarketDataProvider } from '@prices/hybrid-market-data.provider';
import { YahooFinanceProvider } from '@prices/yahoo-finance.provider';

export type MarketDataProviderName = 'hybrid' | 'yahoo';

export function resolveMarketDataProviderName(
  env: NodeJS.ProcessEnv = process.env,
): MarketDataProviderName {
  const value = env.MARKET_DATA_PROVIDER?.trim().toLowerCase() || 'yahoo';

  if (value === 'hybrid' || value === 'yahoo') {
    return value;
  }

  throw new Error(
    `Unsupported MARKET_DATA_PROVIDER "${value}". Supported values: hybrid, yahoo.`,
  );
}

export function createMarketDataProvider(
  env: NodeJS.ProcessEnv = process.env,
): MarketDataProvider {
  switch (resolveMarketDataProviderName(env)) {
    case 'hybrid': {
      const eodhdApiToken = env.EODHD_API_TOKEN?.trim();
      const marketstackApiKey = env.MARKETSTACK_API_KEY?.trim();
      if (!eodhdApiToken || !marketstackApiKey) {
        throw new Error(
          'EODHD_API_TOKEN and MARKETSTACK_API_KEY are required when MARKET_DATA_PROVIDER=hybrid.',
        );
      }
      return new HybridMarketDataProvider({
        eodhdApiToken,
        marketstackApiKey,
      });
    }
    case 'yahoo':
      return new YahooFinanceProvider();
  }
}
