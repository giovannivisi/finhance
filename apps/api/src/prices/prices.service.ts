import { Injectable, Logger } from '@nestjs/common';
import { AssetKind, Prisma } from '@prisma/client';

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

@Injectable()
export class PricesService {
  private readonly logger = new Logger(PricesService.name);
  private readonly cache = new Map<string, CachedPrice>();
  private readonly inFlight = new Map<string, Promise<Prisma.Decimal | null>>();
  private readonly cacheTtlMs = 1000 * 60 * 5;
  private readonly requestTimeoutMs = 3000;

  normalizeCurrency(currency?: string | null): string {
    const normalized = (currency ?? 'EUR').trim().toUpperCase();

    if (!CURRENCY_PATTERN.test(normalized)) {
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
        this.logger.warn(`Yahoo quote failed for ${symbol}: ${response.status}`);
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
}
