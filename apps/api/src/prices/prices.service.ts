import { Injectable, Logger } from '@nestjs/common';

interface CachedPrice {
  price: number;
  ts: number;
}

@Injectable()
export class PricesService {
  private readonly logger = new Logger(PricesService.name);
  private readonly cache = new Map<string, CachedPrice>();
  private readonly CACHE_TTL = 1000 * 60 * 5; // 5 min

  async getLivePrice(ticker: string, opts?: { forceRefresh?: boolean }): Promise<number | null> {
    if (!ticker) return null;

    const now = Date.now();
    const cached = this.cache.get(ticker);

    if (!opts?.forceRefresh && cached && now - cached.ts < this.CACHE_TTL) {
      return cached.price;
    }

    try {
      const res = await fetch(
        `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}`
      );
      const json: any = await res.json();
      const price =
        json?.chart?.result?.[0]?.meta?.regularMarketPrice ?? null;

      if (price !== null) {
        this.cache.set(ticker, { price, ts: now });
      }

      return price;
    } catch (err) {
      this.logger.error(`Price fetch failed for ${ticker}`);
      return null;
    }
  }
}