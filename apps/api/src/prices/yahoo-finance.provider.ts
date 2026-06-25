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

interface YahooPriceResponse {
  chart?: {
    result?: Array<{
      meta?: {
        regularMarketPrice?: number;
      };
    }>;
  };
}

interface YahooSeriesResponse {
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

interface YahooSeriesRangeParams {
  range: string;
  interval: string;
}

const BASE_QUOTE_URL = 'https://query1.finance.yahoo.com/v8/finance/chart/';
const YAHOO_SYMBOL_PATTERN = /^[A-Z0-9.\-=^]{1,32}$/;
const REQUEST_HEADERS = {
  Accept: 'application/json,text/plain,*/*',
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36',
};

const SERIES_RANGE_PARAMS: Record<
  BrokeragePerformanceRange,
  YahooSeriesRangeParams
> = {
  '1D': { range: '1d', interval: '5m' },
  '1W': { range: '5d', interval: '15m' },
  '1M': { range: '1mo', interval: '60m' },
  '1Y': { range: '1y', interval: '1d' },
  MAX: { range: 'max', interval: '1wk' },
};

export class YahooFinanceProvider implements MarketDataProvider {
  readonly id = 'yahoo';
  readonly displayName = 'Yahoo Finance';

  buildMarketSymbol(input: MarketDataInstrument): string {
    const ticker = input.ticker.trim().toUpperCase();
    const exchange = (input.exchange ?? '').trim().toUpperCase();
    const quoteCurrency = input.quoteCurrency.trim().toUpperCase();
    const symbol =
      input.kind === AssetKind.CRYPTO && !ticker.includes('-')
        ? `${ticker}-${quoteCurrency}`
        : `${ticker}${input.kind === AssetKind.CRYPTO ? '' : exchange}`;

    this.assertSymbol(symbol);
    return symbol;
  }

  buildFxSymbol(fromCurrency: string, toCurrency: string): string {
    const symbol = `${fromCurrency.trim().toUpperCase()}${toCurrency
      .trim()
      .toUpperCase()}=X`;
    this.assertSymbol(symbol);
    return symbol;
  }

  async fetchQuote(
    symbol: string,
    timeoutMs: number,
  ): Promise<MarketDataProviderResult<number>> {
    try {
      const response = await fetch(
        `${BASE_QUOTE_URL}${encodeURIComponent(symbol)}`,
        {
          headers: REQUEST_HEADERS,
          signal: AbortSignal.timeout(timeoutMs),
        },
      );

      if (!response.ok) {
        return { ok: false, status: response.status };
      }

      const body = (await response.json()) as YahooPriceResponse;
      const price = body.chart?.result?.[0]?.meta?.regularMarketPrice;

      return {
        ok: true,
        data:
          typeof price === 'number' && Number.isFinite(price) ? price : null,
      };
    } catch (error) {
      return { ok: false, status: null, error };
    }
  }

  async fetchSeries(
    symbol: string,
    range: BrokeragePerformanceRange,
    timeoutMs: number,
  ): Promise<MarketDataProviderResult<MarketDataSeries>> {
    try {
      const params = SERIES_RANGE_PARAMS[range];
      const url = `${BASE_QUOTE_URL}${encodeURIComponent(symbol)}?range=${params.range}&interval=${params.interval}`;
      const response = await fetch(url, {
        headers: REQUEST_HEADERS,
        signal: AbortSignal.timeout(timeoutMs),
      });

      if (!response.ok) {
        return { ok: false, status: response.status };
      }

      const body = (await response.json()) as YahooSeriesResponse;
      const result = body.chart?.result?.[0];
      const timestamps = result?.timestamp ?? [];
      const closes = result?.indicators?.quote?.[0]?.close ?? [];
      const previousCloseRaw = result?.meta?.chartPreviousClose;
      const previousClose =
        typeof previousCloseRaw === 'number' &&
        Number.isFinite(previousCloseRaw)
          ? previousCloseRaw
          : null;

      const points: MarketDataSeriesPoint[] = [];
      for (let index = 0; index < timestamps.length; index += 1) {
        const close = closes[index];
        if (typeof close !== 'number' || !Number.isFinite(close)) {
          continue;
        }

        points.push({ t: timestamps[index] * 1000, price: close });
      }

      if (points.length === 0) {
        return { ok: true, data: null };
      }

      return {
        ok: true,
        data: {
          points,
          previousClose,
          latestPrice: points[points.length - 1].price,
        },
      };
    } catch (error) {
      return { ok: false, status: null, error };
    }
  }

  private assertSymbol(symbol: string): void {
    if (!YAHOO_SYMBOL_PATTERN.test(symbol)) {
      throw new BadRequestException(
        `Unsupported market symbol "${symbol}" for ${this.displayName}.`,
      );
    }
  }
}
