import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import { AssetKind, FxRateSource, Prisma } from '@finhance/db';
import type { BrokeragePerformanceRange } from '@finhance/shared';
import { isSupportedCurrencyCode } from '@/common/catalogues';
import { PrismaService } from '@prisma/prisma.service';
import {
  MARKET_DATA_PROVIDER,
  type MarketDataProvider,
  type MarketDataSeries,
} from '@prices/market-data-provider';

interface CachedPrice {
  price: Prisma.Decimal;
  ts: number;
}

interface ProviderBackoff {
  until: number;
  status: number;
}

export type MarketPriceFailureReason =
  | 'AUTHENTICATION'
  | 'NOT_FOUND'
  | 'RATE_LIMITED'
  | 'TIMEOUT'
  | 'UNAVAILABLE';

export interface MarketPriceFailure {
  provider: string;
  reason: MarketPriceFailureReason;
  status: number | null;
}

export interface MarketPriceResult {
  price: Prisma.Decimal | null;
  failure: MarketPriceFailure | null;
}

export type StoredFxRateStatus = 'EXACT' | 'STALE' | 'MISSING';

export interface StoredFxRateSnapshot {
  rate: Prisma.Decimal | null;
  status: StoredFxRateStatus;
  source: FxRateSource | null;
  rateDate: Date | null;
  updatedAt: Date | null;
}

export type MarketSeries = MarketDataSeries;

interface CachedSeries {
  series: MarketSeries;
  ts: number;
}

const CURRENCY_PATTERN = /^[A-Z]{3}$/;
const ROME_DATE_FORMATTER = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Rome',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const MIN_MAX_AGE_MS = 5000;
const RATE_LIMIT_BACKOFF_MS = 1000 * 60 * 30;

const SERIES_TTL_MS: Record<BrokeragePerformanceRange, number> = {
  '1D': 1000 * 60 * 5,
  '1W': 1000 * 60 * 15,
  '1M': 1000 * 60 * 60,
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

@Injectable()
export class PricesService {
  private readonly logger = new Logger(PricesService.name);
  private readonly cache = new Map<string, CachedPrice>();
  private readonly inFlight = new Map<string, Promise<MarketPriceResult>>();
  private readonly seriesCache = new Map<string, CachedSeries>();
  private readonly seriesInFlight = new Map<
    string,
    Promise<MarketSeries | null>
  >();
  private readonly providerBackoffs = new Map<string, ProviderBackoff>();
  private readonly cacheTtlMs = 1000 * 60 * 5;
  private readonly requestTimeoutMs = 3000;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(MARKET_DATA_PROVIDER)
    private readonly provider: MarketDataProvider,
  ) {}

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
    return this.provider.buildMarketSymbol({
      kind: input.kind,
      ticker: this.normalizeTicker(input.ticker),
      exchange: input.exchange,
      quoteCurrency: this.normalizeCurrency(input.quoteCurrency),
    });
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
    return (await this.getMarketPriceResult(input, opts)).price;
  }

  async getMarketPriceResult(
    input: {
      kind: AssetKind;
      ticker: string;
      exchange?: string | null;
      quoteCurrency: string;
    },
    opts?: { forceRefresh?: boolean; maxAgeMs?: number },
  ): Promise<MarketPriceResult> {
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

    return this.fetchSeries(symbol, range);
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

    const symbol = this.provider.buildFxSymbol(from, to);
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

    const symbol = this.provider.buildFxSymbol(from, to);
    return (await this.fetchQuote(symbol, opts)).price;
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

  private async fetchQuote(
    symbol: string,
    opts?: { forceRefresh?: boolean; maxAgeMs?: number },
  ): Promise<MarketPriceResult> {
    const now = Date.now();
    const cached = this.cache.get(symbol);
    const effectiveTtlMs =
      opts?.maxAgeMs === undefined
        ? this.cacheTtlMs
        : Math.min(this.cacheTtlMs, Math.max(opts.maxAgeMs, MIN_MAX_AGE_MS));

    if (!opts?.forceRefresh && cached && now - cached.ts < effectiveTtlMs) {
      return { price: cached.price, failure: null };
    }

    const backoff = this.getActiveProviderBackoff(symbol, now);
    if (backoff) {
      return {
        price: null,
        failure: this.createMarketPriceFailure(
          symbol,
          backoff.status,
          undefined,
        ),
      };
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
  ): Promise<MarketPriceResult> {
    try {
      const result = await this.provider.fetchQuote(
        symbol,
        this.requestTimeoutMs,
      );
      const providerName = this.provider.getDisplayName(symbol);

      if (!result.ok) {
        if (result.status === 429) {
          this.startProviderBackoff(symbol, now, result.status);
        }

        if (result.error) {
          this.logger.error(
            `${providerName} quote fetch failed for ${symbol}`,
            result.error as Error,
          );
        } else {
          this.logger.warn(
            `${providerName} quote failed for ${symbol}: ${
              result.status ?? 'unknown'
            }`,
          );
        }
        return {
          price: null,
          failure: this.createMarketPriceFailure(
            symbol,
            result.status,
            result.error,
          ),
        };
      }

      if (result.data === null) {
        this.logger.warn(`${providerName} returned no quote for ${symbol}.`);
        return {
          price: null,
          failure: {
            provider: providerName,
            reason: 'NOT_FOUND',
            status: 404,
          },
        };
      }

      const decimal = new Prisma.Decimal(result.data.toString());
      this.cache.set(symbol, { price: decimal, ts: now });
      return { price: decimal, failure: null };
    } catch (error) {
      const providerName = this.provider.getDisplayName(symbol);
      this.logger.error(
        `${providerName} price fetch failed for ${symbol}`,
        error as Error,
      );
      return {
        price: null,
        failure: this.createMarketPriceFailure(symbol, null, error),
      };
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

    if (this.getActiveProviderBackoff(symbol, now)) {
      return this.getStaleSeries(cacheKey);
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
      const result = await this.provider.fetchSeries(
        symbol,
        range,
        SERIES_TIMEOUT_MS[range],
      );
      const providerName = this.provider.getDisplayName(symbol);

      if (!result.ok) {
        if (result.status === 429) {
          this.startProviderBackoff(symbol, now, result.status);
        }

        if (result.error) {
          this.logger.error(
            `${providerName} series fetch failed for ${symbol} (${range})`,
            result.error as Error,
          );
        } else {
          this.logger.warn(
            `${providerName} series failed for ${symbol} (${range}): ${
              result.status ?? 'unknown'
            }`,
          );
        }
        return this.getStaleSeries(cacheKey);
      }

      if (result.data === null) {
        return null;
      }

      this.seriesCache.set(cacheKey, { series: result.data, ts: now });
      return result.data;
    } catch (error) {
      this.logger.error(
        `Series fetch failed for ${symbol} (${range})`,
        error as Error,
      );
      return this.getStaleSeries(cacheKey);
    }
  }

  private getActiveProviderBackoff(
    symbol: string,
    now: number,
  ): ProviderBackoff | null {
    const group = this.provider.getRequestGroup(symbol);
    const backoff = this.providerBackoffs.get(group);
    if (!backoff) {
      return null;
    }

    if (now >= backoff.until) {
      this.providerBackoffs.delete(group);
      return null;
    }

    return backoff;
  }

  private startProviderBackoff(
    symbol: string,
    now: number,
    status: number,
  ): void {
    const group = this.provider.getRequestGroup(symbol);
    const until = now + RATE_LIMIT_BACKOFF_MS;
    const existing = this.providerBackoffs.get(group);
    if (existing && existing.until >= until) {
      return;
    }

    this.providerBackoffs.set(group, { until, status });
    this.logger.warn(
      `${this.provider.getDisplayName(symbol)} requests paused for ${
        RATE_LIMIT_BACKOFF_MS / 60_000
      } minutes after HTTP ${status}.`,
    );
  }

  private createMarketPriceFailure(
    symbol: string,
    status: number | null,
    error?: unknown,
  ): MarketPriceFailure {
    let reason: MarketPriceFailureReason = 'UNAVAILABLE';
    if (status === 401 || status === 403) {
      reason = 'AUTHENTICATION';
    } else if (status === 404) {
      reason = 'NOT_FOUND';
    } else if (status === 429) {
      reason = 'RATE_LIMITED';
    } else if (
      error instanceof Error &&
      (error.name === 'AbortError' || error.name === 'TimeoutError')
    ) {
      reason = 'TIMEOUT';
    }

    return {
      provider: this.provider.getDisplayName(symbol),
      reason,
      status,
    };
  }

  private getStaleSeries(cacheKey: string): MarketSeries | null {
    const cached = this.seriesCache.get(cacheKey);
    return cached ? { ...cached.series, isStale: true } : null;
  }

  private toRomeDateValue(date: Date): Date {
    const key = ROME_DATE_FORMATTER.format(date);
    return new Date(`${key}T00:00:00.000Z`);
  }
}
