import { Injectable, Logger } from '@nestjs/common';
import { AssetKind, FxRateSource, Prisma } from '@finhance/db';
import { isSupportedCurrencyCode } from '@/common/catalogues';
import { PrismaService } from '@prisma/prisma.service';

interface CachedPrice {
  price: Prisma.Decimal;
  ts: number;
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

const BASE_QUOTE_URL = 'https://query1.finance.yahoo.com/v8/finance/chart/';
const CURRENCY_PATTERN = /^[A-Z]{3}$/;
const YAHOO_SYMBOL_PATTERN = /^[A-Z0-9.\-=^]{1,32}$/;
const ROME_DATE_FORMATTER = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Rome',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

@Injectable()
export class PricesService {
  private readonly logger = new Logger(PricesService.name);
  private readonly cache = new Map<string, CachedPrice>();
  private readonly inFlight = new Map<string, Promise<Prisma.Decimal | null>>();
  private readonly cacheTtlMs = 1000 * 60 * 5;
  private readonly requestTimeoutMs = 3000;

  constructor(private readonly prisma: PrismaService) {}

  normalizeCurrency(currency?: string | null): string {
    const normalized = (currency ?? 'EUR').trim().toUpperCase();

    if (
      !CURRENCY_PATTERN.test(normalized) ||
      !isSupportedCurrencyCode(normalized)
    ) {
      throw new Error(`Unsupported currency code "${currency ?? ''}".`);
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
    opts?: { forceRefresh?: boolean },
  ): Promise<Prisma.Decimal | null> {
    const symbol = this.buildMarketSymbol(input);
    return this.fetchQuote(symbol, opts);
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
      throw new Error(`Unsupported Yahoo symbol "${symbol}".`);
    }
  }

  private async fetchQuote(
    symbol: string,
    opts?: { forceRefresh?: boolean },
  ): Promise<Prisma.Decimal | null> {
    const now = Date.now();
    const cached = this.cache.get(symbol);

    if (!opts?.forceRefresh && cached && now - cached.ts < this.cacheTtlMs) {
      return cached.price;
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
          signal: AbortSignal.timeout(this.requestTimeoutMs),
        },
      );

      if (!response.ok) {
        this.logger.warn(
          `Yahoo quote failed for ${symbol}: ${response.status}`,
        );
        return null;
      }

      const body = (await response.json()) as PriceResponseShape;
      const price = body.chart?.result?.[0]?.meta?.regularMarketPrice;

      if (typeof price !== 'number' || !Number.isFinite(price)) {
        return null;
      }

      const decimal = new Prisma.Decimal(price.toString());
      this.cache.set(symbol, { price: decimal, ts: now });
      return decimal;
    } catch (error) {
      this.logger.error(`Price fetch failed for ${symbol}`, error as Error);
      return null;
    }
  }

  private toRomeDateValue(date: Date): Date {
    const key = ROME_DATE_FORMATTER.format(date);
    return new Date(`${key}T00:00:00.000Z`);
  }
}
