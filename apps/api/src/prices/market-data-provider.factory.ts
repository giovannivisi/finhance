import type { MarketDataProvider } from '@prices/market-data-provider';
import { YahooFinanceProvider } from '@prices/yahoo-finance.provider';

export type MarketDataProviderName = 'yahoo';

export function resolveMarketDataProviderName(
  env: NodeJS.ProcessEnv = process.env,
): MarketDataProviderName {
  const value = env.MARKET_DATA_PROVIDER?.trim().toLowerCase() || 'yahoo';

  if (value === 'yahoo') {
    return value;
  }

  throw new Error(
    `Unsupported MARKET_DATA_PROVIDER "${value}". Supported values: yahoo.`,
  );
}

export function createMarketDataProvider(
  env: NodeJS.ProcessEnv = process.env,
): MarketDataProvider {
  switch (resolveMarketDataProviderName(env)) {
    case 'yahoo':
      return new YahooFinanceProvider();
  }
}
