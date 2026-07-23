import type { AssetKind } from '@finhance/db';
import type { BrokeragePerformanceRange } from '@finhance/shared';

export const MARKET_DATA_PROVIDER = Symbol('MARKET_DATA_PROVIDER');

export interface MarketDataInstrument {
  kind: AssetKind;
  ticker: string;
  exchange?: string | null;
  quoteCurrency: string;
}

export interface MarketDataSeriesPoint {
  t: number;
  price: number;
}

export interface MarketDataSeries {
  points: MarketDataSeriesPoint[];
  previousClose: number | null;
  latestPrice: number | null;
  isStale?: boolean;
}

export type MarketDataProviderResult<T> =
  | {
      ok: true;
      data: T | null;
    }
  | {
      ok: false;
      status: number | null;
      error?: unknown;
    };

/**
 * Provider-specific symbol mapping and transport. Application-level caching,
 * persistence, rate-limit handling, and valuation logic stay in PricesService.
 */
export interface MarketDataProvider {
  readonly id: string;
  readonly displayName: string;
  /**
   * Identifies the upstream request pool used for circuit breaking. Composite
   * providers must return different keys for independent upstream services so
   * one rate limit does not disable every market-data source.
   */
  getRequestGroup(symbol: string): string;
  getDisplayName(symbol: string): string;
  buildMarketSymbol(input: MarketDataInstrument): string;
  /**
   * Ordered native routes for an instrument. The first route is preferred;
   * later routes are only used when the preferred provider confirms that it
   * cannot identify the instrument.
   */
  getMarketSymbolCandidates(input: MarketDataInstrument): string[];
  buildFxSymbol(fromCurrency: string, toCurrency: string): string;
  fetchQuote(
    symbol: string,
    timeoutMs: number,
  ): Promise<MarketDataProviderResult<number>>;
  fetchSeries(
    symbol: string,
    range: BrokeragePerformanceRange,
    timeoutMs: number,
  ): Promise<MarketDataProviderResult<MarketDataSeries>>;
}
