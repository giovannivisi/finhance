import { BadRequestException } from '@nestjs/common';
import { AssetKind } from '@finhance/db';
import type { BrokeragePerformanceRange } from '@finhance/shared';
import { EodhdProvider } from '@prices/eodhd.provider';
import type {
  MarketDataInstrument,
  MarketDataProvider,
  MarketDataRequestLimiter,
  MarketDataProviderResult,
  MarketDataSeries,
} from '@prices/market-data-provider';
import { MarketstackProvider } from '@prices/marketstack.provider';

const EODHD_PREFIX = 'eodhd:';
const MARKETSTACK_PREFIX = 'marketstack:';
const YAHOO_PREFIX = 'yahoo:';

/**
 * Routes exact listings to providers with complementary exchange coverage.
 * When both providers know an exact native listing, the second provider is
 * tried only after the preferred provider confirms that it has no data. Yahoo
 * remains the last route for FX, crypto, and unresolved listings.
 */
export class HybridMarketDataProvider implements MarketDataProvider {
  readonly id = 'hybrid';
  readonly displayName = 'Configured market data providers';
  private readonly eodhd: EodhdProvider;
  private readonly marketstack: MarketstackProvider;

  constructor(
    input: { eodhdApiToken: string; marketstackApiKey: string },
    requestLimiter?: MarketDataRequestLimiter,
  ) {
    this.eodhd = new EodhdProvider(input.eodhdApiToken, requestLimiter);
    this.marketstack = new MarketstackProvider(
      input.marketstackApiKey,
      requestLimiter,
    );
  }

  getRequestGroup(symbol: string): string {
    if (symbol.startsWith(MARKETSTACK_PREFIX)) {
      return 'marketstack';
    }
    if (symbol.startsWith(EODHD_PREFIX)) {
      return 'eodhd';
    }
    if (symbol.startsWith(YAHOO_PREFIX)) {
      return 'yahoo';
    }
    throw this.unsupportedRoute();
  }

  getDisplayName(symbol: string): string {
    if (symbol.startsWith(MARKETSTACK_PREFIX)) {
      return this.marketstack.displayName;
    }
    if (symbol.startsWith(EODHD_PREFIX)) {
      return this.eodhd.displayName;
    }
    if (symbol.startsWith(YAHOO_PREFIX)) {
      return this.eodhd.getDisplayName(symbol);
    }
    throw this.unsupportedRoute();
  }

  buildMarketSymbol(input: MarketDataInstrument): string {
    const exchange = (input.exchange ?? '').trim().toUpperCase();
    if (
      input.kind !== AssetKind.CRYPTO &&
      this.marketstack.supportsExchange(exchange)
    ) {
      return this.marketstack.buildMarketSymbol(input);
    }
    return this.eodhd.buildMarketSymbol(input);
  }

  getMarketSymbolCandidates(input: MarketDataInstrument): string[] {
    const exchange = (input.exchange ?? '').trim().toUpperCase();
    if (
      input.kind !== AssetKind.CRYPTO &&
      this.marketstack.supportsExchange(exchange)
    ) {
      return this.combineNativeCandidates(
        this.marketstack.getMarketSymbolCandidates(input),
        this.eodhd,
        input,
      );
    }
    return this.combineNativeCandidates(
      this.eodhd.getMarketSymbolCandidates(input),
      this.marketstack,
      input,
    );
  }

  buildFxSymbol(fromCurrency: string, toCurrency: string): string {
    return this.eodhd.buildFxSymbol(fromCurrency, toCurrency);
  }

  fetchQuote(
    symbol: string,
    timeoutMs: number,
  ): Promise<MarketDataProviderResult<number>> {
    if (symbol.startsWith(MARKETSTACK_PREFIX)) {
      return this.marketstack.fetchQuote(symbol, timeoutMs);
    }
    if (symbol.startsWith(EODHD_PREFIX) || symbol.startsWith(YAHOO_PREFIX)) {
      return this.eodhd.fetchQuote(symbol, timeoutMs);
    }
    return Promise.reject(this.unsupportedRoute());
  }

  fetchSeries(
    symbol: string,
    range: BrokeragePerformanceRange,
    timeoutMs: number,
  ): Promise<MarketDataProviderResult<MarketDataSeries>> {
    if (symbol.startsWith(MARKETSTACK_PREFIX)) {
      return this.marketstack.fetchSeries(symbol, range, timeoutMs);
    }
    if (symbol.startsWith(EODHD_PREFIX) || symbol.startsWith(YAHOO_PREFIX)) {
      return this.eodhd.fetchSeries(symbol, range, timeoutMs);
    }
    return Promise.reject(this.unsupportedRoute());
  }

  private unsupportedRoute(): BadRequestException {
    return new BadRequestException('Unsupported routed market symbol.');
  }

  private combineNativeCandidates(
    primaryCandidates: string[],
    fallbackProvider: MarketDataProvider,
    input: MarketDataInstrument,
  ): string[] {
    const yahooCandidates = primaryCandidates.filter((candidate) =>
      candidate.startsWith(YAHOO_PREFIX),
    );
    const nativeCandidates = primaryCandidates.filter(
      (candidate) => !candidate.startsWith(YAHOO_PREFIX),
    );

    try {
      nativeCandidates.push(fallbackProvider.buildMarketSymbol(input));
    } catch (error) {
      if (!(error instanceof BadRequestException)) {
        throw error;
      }
    }

    return [...new Set([...nativeCandidates, ...yahooCandidates])];
  }
}
