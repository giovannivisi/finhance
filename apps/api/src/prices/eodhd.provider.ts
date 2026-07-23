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

interface EodhdPriceRow {
  date?: string;
  close?: number | string | null;
}

type EodhdFetchResult =
  | { ok: true; body: unknown }
  | { ok: false; status: number | null; error?: unknown };

const BASE_URL = 'https://eodhd.com/api';
const EODHD_PREFIX = 'eodhd:';
const YAHOO_PREFIX = 'yahoo:';
const EODHD_GROUP = 'eodhd';
const YAHOO_GROUP = 'yahoo';
const EODHD_TICKER_PATTERN = /^[A-Z0-9.^-]{1,40}$/;

/**
 * EODHD uses CODE.EXCHANGE identifiers. The values below are EODHD exchange
 * codes, not Yahoo suffixes or ISO MICs. Keeping the translation here lets the
 * rest of the application retain its existing persisted exchange catalogue.
 */
const EODHD_EXCHANGE_BY_SUFFIX: Readonly<Record<string, string>> = {
  '': 'US',
  '.TO': 'TO',
  '.V': 'V',
  '.MX': 'MX',
  '.SA': 'SA',
  '.BA': 'BA',
  '.L': 'LSE',
  '.IR': 'IR',
  '.DE': 'XETRA',
  '.F': 'F',
  '.HM': 'HM',
  '.DU': 'DU',
  '.MU': 'MU',
  '.BE': 'BE',
  '.SG': 'STU',
  '.SW': 'SW',
  '.VI': 'VI',
  '.AS': 'AS',
  '.BR': 'BR',
  '.PA': 'PA',
  '.MC': 'MC',
  '.LS': 'LS',
  '.ST': 'ST',
  '.OL': 'OL',
  '.CO': 'CO',
  '.HE': 'HE',
  '.WA': 'WAR',
  '.PR': 'PR',
  '.AT': 'AT',
  '.IS': 'IS',
  '.JO': 'JSE',
  '.TA': 'TA',
  '.BO': 'BSE',
  '.NS': 'NSE',
  '.T': 'TSE',
  '.KS': 'KO',
  '.KQ': 'KQ',
  '.HK': 'HK',
  '.SS': 'SHG',
  '.SZ': 'SHE',
  '.TW': 'TW',
  '.SI': 'SG',
  '.BK': 'BK',
  '.KL': 'KLSE',
  '.JK': 'JK',
  '.PS': 'PSE',
  '.AX': 'AU',
  '.NZ': 'NZ',
};

/**
 * A small number of securities use different codes across exchanges. These
 * entries preserve the app's broker/Yahoo identifier while requesting the
 * same EUR listing from EODHD's published exchange catalogue.
 */
const EODHD_LISTING_BY_INPUT_SYMBOL: Readonly<Record<string, string>> = {
  'VWCE.HM': 'VWCE.XETRA',
};

const SERIES_LOOKBACK_DAYS: Record<BrokeragePerformanceRange, number> = {
  '1D': 8,
  '1W': 10,
  '1M': 40,
  '1Y': 370,
  MAX: 3650,
};

// EODHD does not publish Tokyo EOD coverage. Its Yahoo suffix is retained as
// an explicit last-mile route instead of inventing an upstream exchange code.
const YAHOO_LISTED_EXCHANGE_SUFFIXES = new Set(['.T']);

/**
 * Exact-listing end-of-day adapter. Yahoo remains the FX, crypto, and Tokyo
 * source so the two upstream services keep separate circuit breakers.
 */
export class EodhdProvider implements MarketDataProvider {
  readonly id = 'eodhd';
  readonly displayName = 'EODHD';
  private readonly yahoo = new YahooFinanceProvider();

  constructor(private readonly apiToken: string) {}

  getRequestGroup(symbol: string): string {
    return symbol.startsWith(YAHOO_PREFIX) ? YAHOO_GROUP : EODHD_GROUP;
  }

  getDisplayName(symbol: string): string {
    return symbol.startsWith(YAHOO_PREFIX)
      ? this.yahoo.displayName
      : this.displayName;
  }

  buildMarketSymbol(input: MarketDataInstrument): string {
    const exchange = (input.exchange ?? '').trim().toUpperCase();
    if (
      input.kind === AssetKind.CRYPTO ||
      YAHOO_LISTED_EXCHANGE_SUFFIXES.has(exchange)
    ) {
      return `${YAHOO_PREFIX}${this.yahoo.buildMarketSymbol(input)}`;
    }

    const ticker = input.ticker.trim().toUpperCase();
    const inputSymbol = `${ticker}${exchange}`;
    const providerListing = EODHD_LISTING_BY_INPUT_SYMBOL[inputSymbol];
    if (providerListing) {
      return `${EODHD_PREFIX}${providerListing}`;
    }
    const eodhdExchange = EODHD_EXCHANGE_BY_SUFFIX[exchange];

    if (!EODHD_TICKER_PATTERN.test(ticker) || !eodhdExchange) {
      throw new BadRequestException(
        `Unsupported market symbol "${ticker}${exchange}" for ${this.displayName}.`,
      );
    }

    return `${EODHD_PREFIX}${ticker}.${eodhdExchange}`;
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

    const result = await this.fetchJson(
      `/eod/${encodeURIComponent(routed.symbol)}`,
      {
        filter: 'last_close',
        fmt: 'json',
      },
      timeoutMs,
    );

    if (!result.ok) {
      return result;
    }

    return { ok: true, data: this.toFiniteNumber(result.body) };
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

    const end = new Date();
    const start = new Date(end);
    start.setUTCDate(start.getUTCDate() - SERIES_LOOKBACK_DAYS[range]);

    const result = await this.fetchJson(
      `/eod/${encodeURIComponent(routed.symbol)}`,
      {
        from: this.toIsoDate(start),
        to: this.toIsoDate(end),
        period: 'd',
        order: 'a',
        fmt: 'json',
      },
      timeoutMs,
    );

    if (!result.ok) {
      return result;
    }

    if (!Array.isArray(result.body)) {
      return {
        ok: false,
        status: 502,
        error: new Error(`${this.displayName} returned an invalid EOD series.`),
      };
    }

    let points = result.body
      .map((entry): MarketDataSeriesPoint | null => {
        if (!this.isPriceRow(entry)) {
          return null;
        }
        const price = this.toFiniteNumber(entry.close);
        const timestamp = entry.date
          ? Date.parse(`${entry.date}T00:00:00.000Z`)
          : Number.NaN;
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
    group: typeof EODHD_GROUP | typeof YAHOO_GROUP;
    symbol: string;
  } {
    if (symbol.startsWith(EODHD_PREFIX)) {
      return {
        group: EODHD_GROUP,
        symbol: symbol.slice(EODHD_PREFIX.length),
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

  private async fetchJson(
    path: string,
    params: Record<string, string>,
    timeoutMs: number,
  ): Promise<EodhdFetchResult> {
    try {
      const search = new URLSearchParams({
        api_token: this.apiToken,
        ...params,
      });
      const response = await fetch(`${BASE_URL}${path}?${search.toString()}`, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(timeoutMs),
      });

      const rawBody = await response.text();
      let body: unknown;
      try {
        body = JSON.parse(rawBody) as unknown;
      } catch (error) {
        const providerMessage = rawBody.trim();
        if (providerMessage) {
          return {
            ok: false,
            status: response.ok
              ? this.resolveMessageStatus(providerMessage)
              : response.status,
            error: new Error(
              `${this.displayName} request failed: ${providerMessage}`,
            ),
          };
        }
        return {
          ok: false,
          status: response.status >= 400 ? response.status : null,
          error,
        };
      }

      const providerMessage = this.getProviderErrorMessage(body);
      if (!response.ok || providerMessage) {
        return {
          ok: false,
          status: response.ok
            ? this.resolveMessageStatus(providerMessage)
            : response.status,
          error: providerMessage
            ? new Error(
                `${this.displayName} request failed: ${providerMessage}`,
              )
            : undefined,
        };
      }

      return { ok: true, body };
    } catch (error) {
      return { ok: false, status: null, error };
    }
  }

  private getProviderErrorMessage(body: unknown): string | null {
    if (typeof body === 'string') {
      const message = body.trim();
      const numeric = Number(message);
      return message && !(Number.isFinite(numeric) && numeric > 0)
        ? message
        : null;
    }

    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return null;
    }

    const record = body as Record<string, unknown>;
    for (const key of ['error', 'message']) {
      if (typeof record[key] === 'string' && record[key].trim()) {
        return record[key].trim();
      }
    }

    return null;
  }

  private resolveMessageStatus(message: string | null): number {
    const normalized = message?.toLowerCase() ?? '';
    if (
      normalized.includes('token') ||
      normalized.includes('unauthenticated') ||
      normalized.includes('forbidden')
    ) {
      return 401;
    }
    if (
      normalized.includes('limit') ||
      normalized.includes('too many') ||
      normalized.includes('quota')
    ) {
      return 429;
    }
    if (normalized.includes('not found') || normalized.includes('unknown')) {
      return 404;
    }
    return 502;
  }

  private isPriceRow(value: unknown): value is EodhdPriceRow {
    return !!value && typeof value === 'object' && !Array.isArray(value);
  }

  private toFiniteNumber(value: unknown): number | null {
    if (
      value === null ||
      value === undefined ||
      value === '' ||
      (typeof value !== 'number' && typeof value !== 'string')
    ) {
      return null;
    }

    const parsed = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }

  private toIsoDate(value: Date): string {
    return value.toISOString().slice(0, 10);
  }
}
