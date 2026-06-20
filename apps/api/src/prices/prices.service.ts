import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { AssetKind, FxRateSource, Prisma } from '@finhance/db';
import type { BrokeragePerformanceRange } from '@finhance/shared';
import { isSupportedCurrencyCode } from '@/common/catalogues';
import { PrismaService } from '@prisma/prisma.service';

interface CachedPrice {
  price: Prisma.Decimal;
  ts: number;
}

interface QuoteBackoff {
  until: number;
  status: number;
}

interface PriceResponseShape {
  chart?: {
    result?: Array<{
      meta?: {
        regularMarketPrice?: number;
      };
    }>;
  };
}

interface SeriesResponseShape {
  chart?: {
    result?: Array<{
      meta?: {
        chartPreviousClose?: number;
      };
      timestamp?: number[];
      indicators?: {
        quote?: Array<{
          close?: Array<number | null>;
        }>;
      };
    }>;
  };
}

export type StoredFxRateStatus = 'EXACT' | 'STALE' | 'MISSING';

export interface StoredFxRateSnapshot {
  rate: Prisma.Decimal | null;
  status: StoredFxRateStatus;
  source: FxRateSource | null;
  rateDate: Date | null;
  updatedAt: Date | null;
}

export interface MarketSeriesPoint {
  t: number; // epoch milliseconds
  price: number;
}

export interface MarketSeries {
  points: MarketSeriesPoint[];
  previousClose: number | null;
  latestPrice: number | null;
}

interface CachedSeries {
  series: MarketSeries;
  ts: number;
}

interface SeriesRangeParams {
  range: string;
  interval: string;
}

const BASE_QUOTE_URL = 'https://query1.finance.yahoo.com/v8/finance/chart/';
const CURRENCY_PATTERN = /^[A-Z]{3}$/;
const YAHOO_SYMBOL_PATTERN = /^[A-Z0-9.\-=^]{1,32}$/;
const ROME_DATE_FORMATTER = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Rome',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const MIN_MAX_AGE_MS = 5000;
const RATE_LIMIT_BACKOFF_MS = 1000 * 60 * 5;
const YAHOO_REQUEST_HEADERS = {
  Accept: 'application/json,text/plain,*/*',
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36',
};

const SERIES_RANGE_PARAMS: Record<
  BrokeragePerformanceRange,
  SeriesRangeParams
> = {
  '1D': { range: '1d', interval: '5m' },
  '1W': { range: '5d', interval: '15m' },
  '1M': { range: '1mo', interval: '60m' },
  '1Y': { range: '1y', interval: '1d' },
  MAX: { range: 'max', interval: '1wk' },
};

const SERIES_TTL_MS: Record<BrokeragePerformanceRange, number> = {
  '1D': 1000 * 60,
  '1W': 1000 * 60 * 5,
  '1M': 1000 * 60 * 30,
  '1Y': 1000 * 60 * 60 * 6,
  MAX: 1000 * 60 * 60 * 24,
};

const SERIES_TIMEOUT_MS: Record<BrokeragePerformanceRange, number> = {
  '1D': 3000,
  '1W': 3000,
  '1M': 3000,
  '1Y': 7000,
  MAX: 10_000,
};

/**
 * German regional venues (Hamburg, Hanover, Frankfurt, Munich, …) carry the
 * same securities as Xetra but Yahoo holds almost no historical series for
 * them — the `close` arrays come back essentially all-null. Their quotes are
 * fine, so only the performance *chart* needs to fall back to the primary
 * Xetra listing of the same ticker.
 */
const SERIES_FALLBACK_EXCHANGE: Record<string, string> = {
  '.HM': '.DE',
  '.HA': '.DE',
  '.F': '.DE',
  '.MU': '.DE',
  '.BE': '.DE',
  '.SG': '.DE',
  '.DU': '.DE',
};

/** A series needs at least this many points to plot or reconstruct anything. */
const MIN_USABLE_SERIES_POINTS = 2;

@Injectable()
export class PricesService {
  private readonly logger = new Logger(PricesService.name);
  private readonly cache = new Map<string, CachedPrice>();
  private readonly quoteBackoff = new Map<string, QuoteBackoff>();
  private readonly inFlight = new Map<string, Promise<Prisma.Decimal | null>>();
  private readonly seriesCache = new Map<string, CachedSeries>();
  private readonly seriesInFlight = new Map<
    string,
    Promise<MarketSeries | null>
  >();
  private readonly cacheTtlMs = 1000 * 60 * 5;
  private readonly requestTimeoutMs = 3000;

  constructor(private readonly prisma: PrismaService) {}

  normalizeCurrency(currency?: string | null): string {
    const normalized = (currency ?? 'EUR').trim().toUpperCase();

    if (
      !CURRENCY_PATTERN.test(normalized) ||
      !isSupportedCurrencyCode(normalized)
    ) {
      throw new BadRequestException(
        `Unsupported currency code "${currency ?? ''}".`,
      );
    }

    return normalized;
  }

  normalizeTicker(ticker: string): string {
    return ticker.trim().toUpperCase();
  }

  buildMarketSymbol(input: {
    kind: AssetKind;
    ticker: string;
    exchange?: string | null;
    quoteCurrency: string;
  }): string {
    const ticker = this.normalizeTicker(input.ticker);
    const quoteCurrency = this.normalizeCurrency(input.quoteCurrency);
    const exchange = (input.exchange ?? '').trim().toUpperCase();

    if (input.kind === AssetKind.CRYPTO) {
      const cryptoTicker = ticker.includes('-')
        ? ticker
        : `${ticker}-${quoteCurrency}`;

      this.assertYahooSymbol(cryptoTicker);
      return cryptoTicker;
    }

    const symbol = `${ticker}${exchange}`;
    this.assertYahooSymbol(symbol);
    return symbol;
  }

  async getMarketPrice(
    input: {
      kind: AssetKind;
      ticker: string;
      exchange?: string | null;
      quoteCurrency: string;
    },
    opts?: { forceRefresh?: boolean; maxAgeMs?: number },
  ): Promise<Prisma.Decimal | null> {
    const symbol = this.buildMarketSymbol(input);
    return this.fetchQuote(symbol, opts);
  }

  /**
   * Fetches a historical price series for a market asset over the given
   * range. Returns null if the symbol is invalid, the upstream request
   * fails, or no usable points were returned.
   */
  async getMarketSeries(
    input: {
      kind: AssetKind;
      ticker: string;
      exchange?: string | null;
      quoteCurrency: string;
    },
    range: BrokeragePerformanceRange,
  ): Promise<MarketSeries | null> {
    let symbol: string;
    try {
      symbol = this.buildMarketSymbol(input);
    } catch (error) {
      this.logger.warn(
        `Cannot build market symbol for series request: ${(error as Error).message}`,
      );
      return null;
    }

    const series = await this.fetchSeries(symbol, range);
    if (series && series.points.length >= MIN_USABLE_SERIES_POINTS) {
      return series;
    }

    // A thinly-traded regional listing (e.g. Hamburg) returned no usable
    // history; retry the chart against the primary listing of the same
    // security, which Yahoo does keep series for.
    const exchange = (input.exchange ?? '').trim().toUpperCase();
    const fallbackExchange = SERIES_FALLBACK_EXCHANGE[exchange];
    if (
      input.kind !== AssetKind.CRYPTO &&
      fallbackExchange &&
      fallbackExchange !== exchange
    ) {
      try {
        const fallbackSymbol = this.buildMarketSymbol({
          ...input,
          exchange: fallbackExchange,
        });
        const fallbackSeries = await this.fetchSeries(fallbackSymbol, range);
        if (
          fallbackSeries &&
          (!series || fallbackSeries.points.length > series.points.length)
        ) {
          return fallbackSeries;
        }
      } catch (error) {
        this.logger.warn(
          `Cannot build fallback market symbol for series request: ${(error as Error).message}`,
        );
      }
    }

    return series;
  }

  /**
   * Fetches a historical FX series for the given currency pair and range.
   * Returns null both on upstream failure and when from === to (callers
   * should treat a same-currency pair as a constant rate of 1).
   */
  async getFxSeries(
    fromCurrency: string,
    toCurrency: string,
    range: BrokeragePerformanceRange,
  ): Promise<MarketSeries | null> {
    const from = this.normalizeCurrency(fromCurrency);
    const to = this.normalizeCurrency(toCurrency);

    if (from === to) {
      return null;
    }

    const symbol = `${from}${to}=X`;
    this.assertYahooSymbol(symbol);
    return this.fetchSeries(symbol, range);
  }

  async getFxRate(
    fromCurrency: string,
    toCurrency = 'EUR',
    opts?: { forceRefresh?: boolean },
  ): Promise<Prisma.Decimal | null> {
    const from = this.normalizeCurrency(fromCurrency);
    const to = this.normalizeCurrency(toCurrency);

    if (from === to) {
      return new Prisma.Decimal(1);
    }

    const symbol = `${from}${to}=X`;
    this.assertYahooSymbol(symbol);
    return this.fetchQuote(symbol, opts);
  }

  async getStoredFxRate(
    ownerId: string,
    date: Date,
    fromCurrency: string,
    toCurrency = 'EUR',
  ): Promise<Prisma.Decimal | null> {
    const from = this.normalizeCurrency(fromCurrency);
    const to = this.normalizeCurrency(toCurrency);

    if (from === to) {
      return new Prisma.Decimal(1);
    }

    const record = await this.prisma.fxRate.findUnique({
      where: {
        userId_rateDate_fromCurrency_toCurrency: {
          userId: ownerId,
          rateDate: this.toRomeDateValue(date),
          fromCurrency: from,
          toCurrency: to,
        },
      },
    });

    return record?.rate ?? null;
  }

  async getStoredFxRateSnapshot(
    ownerId: string,
    date: Date,
    fromCurrency: string,
    toCurrency = 'EUR',
  ): Promise<StoredFxRateSnapshot> {
    const from = this.normalizeCurrency(fromCurrency);
    const to = this.normalizeCurrency(toCurrency);

    if (from === to) {
      return {
        rate: new Prisma.Decimal(1),
        status: 'EXACT',
        source: null,
        rateDate: this.toRomeDateValue(date),
        updatedAt: date,
      };
    }

    const exactRateDate = this.toRomeDateValue(date);
    const stored = await this.prisma.fxRate.findUnique({
      where: {
        userId_rateDate_fromCurrency_toCurrency: {
          userId: ownerId,
          rateDate: exactRateDate,
          fromCurrency: from,
          toCurrency: to,
        },
      },
    });

    if (stored) {
      return {
        rate: stored.rate,
        status: 'EXACT',
        source: stored.source,
        rateDate: stored.rateDate,
        updatedAt: stored.updatedAt,
      };
    }

    const latestStored = await this.prisma.fxRate.findFirst({
      where: {
        userId: ownerId,
        fromCurrency: from,
        toCurrency: to,
      },
      orderBy: [{ rateDate: 'desc' }, { updatedAt: 'desc' }],
    });

    if (latestStored) {
      return {
        rate: latestStored.rate,
        status: 'STALE',
        source: latestStored.source,
        rateDate: latestStored.rateDate,
        updatedAt: latestStored.updatedAt,
      };
    }

    return {
      rate: null,
      status: 'MISSING',
      source: null,
      rateDate: null,
      updatedAt: null,
    };
  }

  async getFxRateForDate(
    ownerId: string,
    date: Date,
    fromCurrency: string,
    toCurrency = 'EUR',
    opts?: { forceRefresh?: boolean },
  ): Promise<Prisma.Decimal | null> {
    const from = this.normalizeCurrency(fromCurrency);
    const to = this.normalizeCurrency(toCurrency);

    if (from === to) {
      return new Prisma.Decimal(1);
    }

    const rateDate = this.toRomeDateValue(date);
    if (!opts?.forceRefresh) {
      const stored = await this.prisma.fxRate.findUnique({
        where: {
          userId_rateDate_fromCurrency_toCurrency: {
            userId: ownerId,
            rateDate,
            fromCurrency: from,
            toCurrency: to,
          },
        },
      });

      if (stored) {
        return stored.rate;
      }
    }

    const liveRate = await this.getFxRate(from, to, opts);
    if (!liveRate) {
      return null;
    }

    await this.prisma.fxRate.upsert({
      where: {
        userId_rateDate_fromCurrency_toCurrency: {
          userId: ownerId,
          rateDate,
          fromCurrency: from,
          toCurrency: to,
        },
      },
      update: {
        rate: liveRate,
        source: FxRateSource.LIVE,
      },
      create: {
        userId: ownerId,
        rateDate,
        fromCurrency: from,
        toCurrency: to,
        rate: liveRate,
        source: FxRateSource.LIVE,
      },
    });

    return liveRate;
  }

  async saveManualFxRate(
    ownerId: string,
    date: Date,
    fromCurrency: string,
    toCurrency: string,
    rate: Prisma.Decimal | number | string,
  ): Promise<Prisma.Decimal> {
    const from = this.normalizeCurrency(fromCurrency);
    const to = this.normalizeCurrency(toCurrency);
    const normalizedRate = new Prisma.Decimal(rate.toString());

    if (from === to) {
      return new Prisma.Decimal(1);
    }

    const saved = await this.prisma.fxRate.upsert({
      where: {
        userId_rateDate_fromCurrency_toCurrency: {
          userId: ownerId,
          rateDate: this.toRomeDateValue(date),
          fromCurrency: from,
          toCurrency: to,
        },
      },
      update: {
        rate: normalizedRate,
        source: FxRateSource.MANUAL,
      },
      create: {
        userId: ownerId,
        rateDate: this.toRomeDateValue(date),
        fromCurrency: from,
        toCurrency: to,
        rate: normalizedRate,
        source: FxRateSource.MANUAL,
      },
    });

    return saved.rate;
  }

  private assertYahooSymbol(symbol: string): void {
    if (!YAHOO_SYMBOL_PATTERN.test(symbol)) {
      throw new BadRequestException(`Unsupported Yahoo symbol "${symbol}".`);
    }
  }

  private async fetchQuote(
    symbol: string,
    opts?: { forceRefresh?: boolean; maxAgeMs?: number },
  ): Promise<Prisma.Decimal | null> {
    const now = Date.now();
    const cached = this.cache.get(symbol);
    const effectiveTtlMs =
      opts?.maxAgeMs === undefined
        ? this.cacheTtlMs
        : Math.min(this.cacheTtlMs, Math.max(opts.maxAgeMs, MIN_MAX_AGE_MS));

    if (!opts?.forceRefresh && cached && now - cached.ts < effectiveTtlMs) {
      return cached.price;
    }

    const backoff = this.quoteBackoff.get(symbol);
    if (backoff && now < backoff.until) {
      if (cached) {
        return cached.price;
      }

      this.logger.warn(
        `Skipping Yahoo quote for ${symbol}: prior ${backoff.status} response is cooling down.`,
      );
      return null;
    }

    const inFlight = this.inFlight.get(symbol);
    if (inFlight) {
      return inFlight;
    }

    const request = this.requestQuote(symbol, now);
    this.inFlight.set(symbol, request);

    try {
      return await request;
    } finally {
      this.inFlight.delete(symbol);
    }
  }

  private async requestQuote(
    symbol: string,
    now: number,
  ): Promise<Prisma.Decimal | null> {
    try {
      const response = await fetch(
        `${BASE_QUOTE_URL}${encodeURIComponent(symbol)}`,
        {
          headers: YAHOO_REQUEST_HEADERS,
          signal: AbortSignal.timeout(this.requestTimeoutMs),
        },
      );

      if (!response.ok) {
        if (response.status === 429) {
          this.quoteBackoff.set(symbol, {
            until: now + RATE_LIMIT_BACKOFF_MS,
            status: response.status,
          });
        }

        this.logger.warn(
          `Yahoo quote failed for ${symbol}: ${response.status}`,
        );
        return this.cache.get(symbol)?.price ?? null;
      }

      const body = (await response.json()) as PriceResponseShape;
      const price = body.chart?.result?.[0]?.meta?.regularMarketPrice;

      if (typeof price !== 'number' || !Number.isFinite(price)) {
        return null;
      }

      const decimal = new Prisma.Decimal(price.toString());
      this.quoteBackoff.delete(symbol);
      this.cache.set(symbol, { price: decimal, ts: now });
      return decimal;
    } catch (error) {
      this.logger.error(`Price fetch failed for ${symbol}`, error as Error);
      return null;
    }
  }

  private async fetchSeries(
    symbol: string,
    range: BrokeragePerformanceRange,
  ): Promise<MarketSeries | null> {
    const cacheKey = `${symbol}|${range}`;
    const now = Date.now();
    const cached = this.seriesCache.get(cacheKey);
    const ttlMs = SERIES_TTL_MS[range];

    if (cached && now - cached.ts < ttlMs) {
      return cached.series;
    }

    const inFlight = this.seriesInFlight.get(cacheKey);
    if (inFlight) {
      return inFlight;
    }

    const request = this.requestSeries(symbol, range, cacheKey, now);
    this.seriesInFlight.set(cacheKey, request);

    try {
      return await request;
    } finally {
      this.seriesInFlight.delete(cacheKey);
    }
  }

  private async requestSeries(
    symbol: string,
    range: BrokeragePerformanceRange,
    cacheKey: string,
    now: number,
  ): Promise<MarketSeries | null> {
    try {
      const params = SERIES_RANGE_PARAMS[range];
      const url = `${BASE_QUOTE_URL}${encodeURIComponent(symbol)}?range=${params.range}&interval=${params.interval}`;
      const response = await fetch(url, {
        headers: YAHOO_REQUEST_HEADERS,
        signal: AbortSignal.timeout(SERIES_TIMEOUT_MS[range]),
      });

      if (!response.ok) {
        this.logger.warn(
          `Yahoo series failed for ${symbol} (${range}): ${response.status}`,
        );
        return null;
      }

      const body = (await response.json()) as SeriesResponseShape;
      const result = body.chart?.result?.[0];
      const timestamps = result?.timestamp ?? [];
      const closes = result?.indicators?.quote?.[0]?.close ?? [];
      const previousCloseRaw = result?.meta?.chartPreviousClose;
      const previousClose =
        typeof previousCloseRaw === 'number' &&
        Number.isFinite(previousCloseRaw)
          ? previousCloseRaw
          : null;

      const points: MarketSeriesPoint[] = [];
      for (let i = 0; i < timestamps.length; i += 1) {
        const close = closes[i];
        if (typeof close !== 'number' || !Number.isFinite(close)) {
          continue;
        }

        points.push({ t: timestamps[i] * 1000, price: close });
      }

      if (points.length === 0) {
        return null;
      }

      const series: MarketSeries = {
        points,
        previousClose,
        latestPrice: points[points.length - 1].price,
      };

      this.seriesCache.set(cacheKey, { series, ts: now });
      return series;
    } catch (error) {
      this.logger.error(
        `Series fetch failed for ${symbol} (${range})`,
        error as Error,
      );
      return null;
    }
  }

  private toRomeDateValue(date: Date): Date {
    const key = ROME_DATE_FORMATTER.format(date);
    return new Date(`${key}T00:00:00.000Z`);
  }
}
