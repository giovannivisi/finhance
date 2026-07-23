import { BadRequestException } from '@nestjs/common';
import { AssetKind } from '@finhance/db';
import type { BrokeragePerformanceRange } from '@finhance/shared';
import type {
  MarketDataInstrument,
  MarketDataProvider,
  MarketDataProviderResult,
  MarketDataSeries,
  MarketDataSeriesPoint,
} from '@prices/market-data-provider';
import { YahooFinanceProvider } from '@prices/yahoo-finance.provider';

interface MarketstackError {
  code?: string;
  message?: string;
}

interface MarketstackPage<T> {
  pagination?: {
    limit?: number;
    offset?: number;
    count?: number;
    total?: number;
  };
  data?: T[];
  error?: MarketstackError;
}

interface MarketstackEodPrice {
  close?: number | string | null;
  date?: string;
  exchange?: string;
  symbol?: string;
}

type MarketstackPageResult<T> =
  | { ok: true; body: MarketstackPage<T> }
  | { ok: false; status: number | null; error?: unknown };

// Marketstack's published OpenAPI v2 specification keeps the exchange-scoped
// paths used below, but v1 no longer resolves its current ticker catalogue.
const BASE_URL = 'https://api.marketstack.com/v2';
const MARKETSTACK_PREFIX = 'marketstack:';
const YAHOO_PREFIX = 'yahoo:';
const MARKETSTACK_GROUP = 'marketstack';
const YAHOO_GROUP = 'yahoo';
const MARKETSTACK_TICKER_PATTERN = /^[A-Z0-9.^-]{1,40}$/;
const SERIES_PAGE_SIZE = 1000;
const MAX_SERIES_POINTS = 3000;

/**
 * Marketstack exchange identifiers for every matching entry in the app's
 * catalogue. These are the provider's published values (which are usually
 * ISO MICs, with `XETRA` as the notable provider-specific exception).
 */
const MARKETSTACK_EXCHANGE_BY_SUFFIX: Readonly<Record<string, string>> = {
  '.TO': 'XTSE',
  '.V': 'XTSX',
  '.MX': 'XMEX',
  '.SA': 'BVMF',
  '.BA': 'XBUE',
  '.L': 'XLON',
  '.DE': 'XETRA',
  '.F': 'XFRA',
  '.SG': 'XSTU',
  '.SW': 'XSWX',
  '.AS': 'XAMS',
  '.BR': 'XBRU',
  '.PA': 'XPAR',
  '.MC': 'BMEX',
  '.LS': 'XLIS',
  '.MI': 'XMIL',
  '.ST': 'XSTO',
  '.OL': 'XOSL',
  '.CO': 'XCSE',
  '.HE': 'XHEL',
  '.WA': 'XWAR',
  '.IS': 'XIST',
  '.JO': 'XJSE',
  '.TA': 'XTAE',
  '.BO': 'XBOM',
  '.NS': 'XNSE',
  '.KS': 'XKRX',
  '.HK': 'XHKG',
  '.SS': 'XSHG',
  '.SZ': 'XSHE',
  '.TW': 'XTAI',
  '.SI': 'XSES',
  '.BK': 'XBKK',
  '.JK': 'XIDX',
  '.NZ': 'XNZE',
};

const SERIES_LOOKBACK_DAYS: Record<BrokeragePerformanceRange, number> = {
  '1D': 8,
  '1W': 10,
  '1M': 40,
  '1Y': 370,
  MAX: 3650,
};

/**
 * Uses Marketstack for its explicitly supported exchange listings and retains
 * Yahoo for FX and crypto. A higher-level router selects this adapter only for
 * markets it can identify exactly.
 */
export class MarketstackProvider implements MarketDataProvider {
  readonly id = 'marketstack';
  readonly displayName = 'Marketstack';
  private readonly yahoo = new YahooFinanceProvider();

  constructor(private readonly apiKey: string) {}

  getRequestGroup(symbol: string): string {
    return symbol.startsWith(YAHOO_PREFIX) ? YAHOO_GROUP : MARKETSTACK_GROUP;
  }

  getDisplayName(symbol: string): string {
    return symbol.startsWith(YAHOO_PREFIX)
      ? this.yahoo.displayName
      : this.displayName;
  }

  supportsExchange(exchange: string | null | undefined): boolean {
    const normalized = (exchange ?? '').trim().toUpperCase();
    return MARKETSTACK_EXCHANGE_BY_SUFFIX[normalized] !== undefined;
  }

  buildMarketSymbol(input: MarketDataInstrument): string {
    if (input.kind === AssetKind.CRYPTO) {
      return `${YAHOO_PREFIX}${this.yahoo.buildMarketSymbol(input)}`;
    }

    const ticker = input.ticker.trim().toUpperCase();
    const exchange = (input.exchange ?? '').trim().toUpperCase();
    const providerExchange = MARKETSTACK_EXCHANGE_BY_SUFFIX[exchange];

    if (
      !MARKETSTACK_TICKER_PATTERN.test(ticker) ||
      providerExchange === undefined
    ) {
      throw new BadRequestException(
        `Unsupported market symbol "${ticker}${exchange}" for ${this.displayName}.`,
      );
    }

    return `${MARKETSTACK_PREFIX}${ticker}@${providerExchange}`;
  }

  getMarketSymbolCandidates(input: MarketDataInstrument): string[] {
    return [
      this.buildMarketSymbol(input),
      `${YAHOO_PREFIX}${this.yahoo.buildMarketSymbol(input)}`,
    ];
  }

  buildFxSymbol(fromCurrency: string, toCurrency: string): string {
    return `${YAHOO_PREFIX}${this.yahoo.buildFxSymbol(fromCurrency, toCurrency)}`;
  }

  async fetchQuote(
    symbol: string,
    timeoutMs: number,
  ): Promise<MarketDataProviderResult<number>> {
    const routed = this.parseRoutedSymbol(symbol);
    if (routed.group === YAHOO_GROUP) {
      return this.yahoo.fetchQuote(routed.symbol, timeoutMs);
    }

    const listing = this.parseMarketstackListing(routed.symbol);
    const result = await this.fetchPage<MarketstackEodPrice>(
      `/exchanges/${encodeURIComponent(listing.exchange)}/eod/latest`,
      {
        symbols: listing.ticker,
        limit: '1',
      },
      timeoutMs,
    );

    if (!result.ok) {
      return result;
    }

    const row = result.body.data?.find((entry) =>
      this.matchesListing(entry, listing),
    );
    const price = this.toFiniteNumber(row?.close);
    return { ok: true, data: price };
  }

  async fetchSeries(
    symbol: string,
    range: BrokeragePerformanceRange,
    timeoutMs: number,
  ): Promise<MarketDataProviderResult<MarketDataSeries>> {
    const routed = this.parseRoutedSymbol(symbol);
    if (routed.group === YAHOO_GROUP) {
      return this.yahoo.fetchSeries(routed.symbol, range, timeoutMs);
    }

    const listing = this.parseMarketstackListing(routed.symbol);
    const end = new Date();
    const start = new Date(end);
    start.setUTCDate(start.getUTCDate() - SERIES_LOOKBACK_DAYS[range]);

    const rows: MarketstackEodPrice[] = [];
    let offset = 0;
    let total = Number.POSITIVE_INFINITY;

    while (offset < total && rows.length < MAX_SERIES_POINTS) {
      const result = await this.fetchPage<MarketstackEodPrice>(
        `/exchanges/${encodeURIComponent(listing.exchange)}/eod`,
        {
          symbols: listing.ticker,
          date_from: this.toIsoDate(start),
          date_to: this.toIsoDate(end),
          sort: 'ASC',
          limit: SERIES_PAGE_SIZE.toString(),
          offset: offset.toString(),
        },
        timeoutMs,
      );

      if (!result.ok) {
        return result;
      }

      const pageRows = (result.body.data ?? []).filter((row) =>
        this.matchesListing(row, listing),
      );
      rows.push(...pageRows);
      total = result.body.pagination?.total ?? rows.length;
      const count = result.body.pagination?.count ?? pageRows.length;
      if (count === 0) {
        break;
      }
      offset += count;
    }

    let points = rows
      .map((row): MarketDataSeriesPoint | null => {
        const price = this.toFiniteNumber(row.close);
        const timestamp = row.date ? Date.parse(row.date) : Number.NaN;
        return price === null || !Number.isFinite(timestamp)
          ? null
          : { t: timestamp, price };
      })
      .filter((point): point is MarketDataSeriesPoint => point !== null)
      .sort((left, right) => left.t - right.t);

    if (range === '1D' && points.length > 2) {
      points = points.slice(-2);
    }

    if (points.length === 0) {
      return { ok: true, data: null };
    }

    return {
      ok: true,
      data: {
        points,
        previousClose:
          range === '1D' && points.length > 1
            ? points[points.length - 2].price
            : null,
        latestPrice: points[points.length - 1].price,
      },
    };
  }

  private parseRoutedSymbol(symbol: string): {
    group: typeof MARKETSTACK_GROUP | typeof YAHOO_GROUP;
    symbol: string;
  } {
    if (symbol.startsWith(MARKETSTACK_PREFIX)) {
      return {
        group: MARKETSTACK_GROUP,
        symbol: symbol.slice(MARKETSTACK_PREFIX.length),
      };
    }

    if (symbol.startsWith(YAHOO_PREFIX)) {
      return {
        group: YAHOO_GROUP,
        symbol: symbol.slice(YAHOO_PREFIX.length),
      };
    }

    throw new BadRequestException(
      `Unsupported routed market symbol for ${this.displayName}.`,
    );
  }

  private parseMarketstackListing(symbol: string): {
    ticker: string;
    exchange: string;
  } {
    const separatorIndex = symbol.lastIndexOf('@');
    if (separatorIndex <= 0 || separatorIndex === symbol.length - 1) {
      throw new BadRequestException(
        `Unsupported Marketstack listing symbol "${symbol}".`,
      );
    }

    return {
      ticker: symbol.slice(0, separatorIndex),
      exchange: symbol.slice(separatorIndex + 1),
    };
  }

  private matchesListing(
    row: MarketstackEodPrice,
    listing: { ticker: string; exchange: string },
  ): boolean {
    const symbol = row.symbol?.trim().toUpperCase();
    const exchange = row.exchange?.trim().toUpperCase();
    return (
      (!symbol || symbol === listing.ticker) &&
      (!exchange || exchange === listing.exchange)
    );
  }

  private async fetchPage<T>(
    path: string,
    params: Record<string, string>,
    timeoutMs: number,
  ): Promise<MarketstackPageResult<T>> {
    try {
      const search = new URLSearchParams({
        access_key: this.apiKey,
        ...params,
      });
      const response = await fetch(`${BASE_URL}${path}?${search.toString()}`, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(timeoutMs),
      });
      let body: MarketstackPage<T>;
      try {
        body = (await response.json()) as MarketstackPage<T>;
      } catch (error) {
        return {
          ok: false,
          status: response.status >= 400 ? response.status : null,
          error,
        };
      }

      if (!response.ok || body.error) {
        return {
          ok: false,
          status: this.resolveErrorStatus(response.status, body.error),
          error: body.error
            ? new Error(
                `${this.displayName} request failed (${body.error.code ?? 'unknown'}): ${body.error.message ?? 'unknown error'}`,
              )
            : undefined,
        };
      }

      return { ok: true, body };
    } catch (error) {
      return { ok: false, status: null, error };
    }
  }

  private resolveErrorStatus(
    responseStatus: number,
    error?: MarketstackError,
  ): number {
    const code = error?.code?.toLowerCase() ?? '';
    if (code.includes('access_key')) {
      return 401;
    }
    if (code.includes('limit') || code.includes('rate')) {
      return 429;
    }
    if (code.includes('no_valid_symbols') || code.includes('not_found')) {
      return 404;
    }
    if (responseStatus >= 400) {
      return responseStatus;
    }
    return 502;
  }

  private toFiniteNumber(
    value: number | string | null | undefined,
  ): number | null {
    if (value === null || value === undefined || value === '') {
      return null;
    }

    const parsed = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }

  private toIsoDate(value: Date): string {
    return value.toISOString().slice(0, 10);
  }
}
