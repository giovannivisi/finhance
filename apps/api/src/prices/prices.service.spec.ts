import { AssetKind } from '@finhance/db';
import { PricesService } from '@prices/prices.service';

function jsonResponse(
  body: unknown,
  ok = true,
  status = ok ? 200 : 500,
): Response {
  return {
    ok,
    status,
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

function chartSeriesBody(input: {
  timestamps: number[];
  closes: Array<number | null>;
  previousClose?: number | null;
}): unknown {
  return {
    chart: {
      result: [
        {
          timestamp: input.timestamps,
          meta: {
            chartPreviousClose: input.previousClose ?? null,
          },
          indicators: {
            quote: [{ close: input.closes }],
          },
        },
      ],
    },
  };
}

describe('PricesService', () => {
  let service: PricesService;
  let prisma: {
    fxRate: {
      findUnique: jest.Mock;
      findFirst: jest.Mock;
      upsert: jest.Mock;
    };
  };
  let fetchMock: jest.Mock;
  let originalFetch: typeof global.fetch;

  beforeEach(() => {
    prisma = {
      fxRate: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        upsert: jest.fn(),
      },
    };
    service = new PricesService(prisma as never);

    originalFetch = global.fetch;
    fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof global.fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('normalizes crypto symbols to a Yahoo pair', () => {
    expect(
      service.buildMarketSymbol({
        kind: AssetKind.CRYPTO,
        ticker: 'btc',
        exchange: '_CRYPTO_',
        quoteCurrency: 'usd',
      }),
    ).toBe('BTC-USD');
  });

  it('normalizes stock symbols with exchange suffixes', () => {
    expect(
      service.buildMarketSymbol({
        kind: AssetKind.STOCK,
        ticker: 'enel',
        exchange: '.mi',
        quoteCurrency: 'eur',
      }),
    ).toBe('ENEL.MI');
  });

  it('rejects unsupported currency codes', () => {
    expect(() => service.normalizeCurrency('EURO')).toThrow(
      'Unsupported currency code "EURO".',
    );
  });

  it('returns an exact stored FX rate when today is already persisted', async () => {
    const updatedAt = new Date('2026-05-27T10:00:00.000Z');
    prisma.fxRate.findUnique.mockResolvedValue({
      rate: { toString: () => '0.91' },
      source: 'LIVE',
      rateDate: new Date('2026-05-27T00:00:00.000Z'),
      updatedAt,
    });

    const result = await service.getStoredFxRateSnapshot(
      'local-dev',
      new Date('2026-05-27T12:00:00.000Z'),
      'USD',
      'EUR',
    );

    expect(result.status).toBe('EXACT');
    expect(result.rate?.toString()).toBe('0.91');
    expect(result.source).toBe('LIVE');
    expect(result.updatedAt).toEqual(updatedAt);
    expect(prisma.fxRate.findFirst).not.toHaveBeenCalled();
  });

  it('falls back to the latest stored FX rate when today is missing', async () => {
    const updatedAt = new Date('2026-05-26T18:00:00.000Z');
    prisma.fxRate.findUnique.mockResolvedValue(null);
    prisma.fxRate.findFirst.mockResolvedValue({
      rate: { toString: () => '0.89' },
      source: 'MANUAL',
      rateDate: new Date('2026-05-26T00:00:00.000Z'),
      updatedAt,
    });

    const result = await service.getStoredFxRateSnapshot(
      'local-dev',
      new Date('2026-05-27T12:00:00.000Z'),
      'USD',
      'EUR',
    );

    expect(result.status).toBe('STALE');
    expect(result.rate?.toString()).toBe('0.89');
    expect(result.source).toBe('MANUAL');
    expect(result.updatedAt).toEqual(updatedAt);
  });

  it('reports missing when no stored FX rate exists', async () => {
    prisma.fxRate.findUnique.mockResolvedValue(null);
    prisma.fxRate.findFirst.mockResolvedValue(null);

    const result = await service.getStoredFxRateSnapshot(
      'local-dev',
      new Date('2026-05-27T12:00:00.000Z'),
      'USD',
      'EUR',
    );

    expect(result).toEqual({
      rate: null,
      status: 'MISSING',
      source: null,
      rateDate: null,
      updatedAt: null,
    });
  });

  describe('getMarketSeries', () => {
    it('filters out null closes and parses the previous close', async () => {
      fetchMock.mockResolvedValue(
        jsonResponse(
          chartSeriesBody({
            timestamps: [1000, 2000, 3000],
            closes: [100, null, 102],
            previousClose: 99,
          }),
        ),
      );

      const series = await service.getMarketSeries(
        {
          kind: AssetKind.STOCK,
          ticker: 'AAPL',
          exchange: 'NASDAQ',
          quoteCurrency: 'USD',
        },
        '1D',
      );

      expect(series).toEqual({
        points: [
          { t: 1_000_000, price: 100 },
          { t: 3_000_000, price: 102 },
        ],
        previousClose: 99,
        latestPrice: 102,
      });
    });

    it('returns null when the upstream request fails', async () => {
      fetchMock.mockResolvedValue(jsonResponse({}, false));

      const series = await service.getMarketSeries(
        {
          kind: AssetKind.STOCK,
          ticker: 'AAPL',
          exchange: 'NASDAQ',
          quoteCurrency: 'USD',
        },
        '1D',
      );

      expect(series).toBeNull();
    });

    it('returns null when no usable points are returned', async () => {
      fetchMock.mockResolvedValue(
        jsonResponse(
          chartSeriesBody({ timestamps: [1000, 2000], closes: [null, null] }),
        ),
      );

      const series = await service.getMarketSeries(
        {
          kind: AssetKind.STOCK,
          ticker: 'AAPL',
          exchange: 'NASDAQ',
          quoteCurrency: 'USD',
        },
        '1D',
      );

      expect(series).toBeNull();
    });

    it('caches series per range using range-specific TTLs', async () => {
      fetchMock.mockResolvedValue(
        jsonResponse(
          chartSeriesBody({
            timestamps: [1000],
            closes: [100],
            previousClose: 99,
          }),
        ),
      );

      const input = {
        kind: AssetKind.STOCK,
        ticker: 'AAPL',
        exchange: 'NASDAQ',
        quoteCurrency: 'USD',
      };

      await service.getMarketSeries(input, '1D');
      await service.getMarketSeries(input, '1D');
      expect(fetchMock).toHaveBeenCalledTimes(1);

      // A different range is cached independently and triggers a new request.
      await service.getMarketSeries(input, '1W');
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });
  });

  describe('getFxSeries', () => {
    it('returns null when the from and to currencies are the same', async () => {
      const series = await service.getFxSeries('EUR', 'EUR', '1D');

      expect(series).toBeNull();
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('fetches a series for the FX pair symbol', async () => {
      fetchMock.mockResolvedValue(
        jsonResponse(
          chartSeriesBody({
            timestamps: [1000],
            closes: [0.92],
            previousClose: 0.91,
          }),
        ),
      );

      const series = await service.getFxSeries('USD', 'EUR', '1D');

      expect(series).toEqual({
        points: [{ t: 1_000_000, price: 0.92 }],
        previousClose: 0.91,
        latestPrice: 0.92,
      });
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('USDEUR%3DX'),
        expect.anything(),
      );
    });
  });

  describe('getMarketPrice with maxAgeMs', () => {
    const marketInput = {
      kind: AssetKind.STOCK,
      ticker: 'AAPL',
      exchange: 'NASDAQ',
      quoteCurrency: 'USD',
    };

    it('reuses a cached quote when it is within maxAgeMs', async () => {
      fetchMock.mockResolvedValue(
        jsonResponse({
          chart: { result: [{ meta: { regularMarketPrice: 150 } }] },
        }),
      );

      const first = await service.getMarketPrice(marketInput, {
        maxAgeMs: 60_000,
      });
      const second = await service.getMarketPrice(marketInput, {
        maxAgeMs: 60_000,
      });

      expect(first?.toString()).toBe('150');
      expect(second?.toString()).toBe('150');
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const firstCall = fetchMock.mock.calls[0] as [string, RequestInit];
      const headers = firstCall[1].headers as Record<string, string>;
      expect(firstCall[0]).toContain('AAPLNASDAQ');
      expect(headers.Accept).toContain('application/json');
      expect(headers['User-Agent']).toContain('Mozilla/5.0');
    });

    it('forces a refetch when maxAgeMs is smaller than the cached entry age', async () => {
      let now = 0;
      jest.spyOn(Date, 'now').mockImplementation(() => now);

      fetchMock
        .mockResolvedValueOnce(
          jsonResponse({
            chart: { result: [{ meta: { regularMarketPrice: 150 } }] },
          }),
        )
        .mockResolvedValueOnce(
          jsonResponse({
            chart: { result: [{ meta: { regularMarketPrice: 151 } }] },
          }),
        );

      const first = await service.getMarketPrice(marketInput, {
        maxAgeMs: 5000,
      });
      now = 10_000;
      const second = await service.getMarketPrice(marketInput, {
        maxAgeMs: 5000,
      });

      expect(first?.toString()).toBe('150');
      expect(second?.toString()).toBe('151');
      expect(fetchMock).toHaveBeenCalledTimes(2);

      jest.spyOn(Date, 'now').mockRestore();
    });

    it('clamps maxAgeMs to a minimum of 5 seconds', async () => {
      let now = 0;
      jest.spyOn(Date, 'now').mockImplementation(() => now);

      fetchMock.mockResolvedValue(
        jsonResponse({
          chart: { result: [{ meta: { regularMarketPrice: 150 } }] },
        }),
      );

      await service.getMarketPrice(marketInput, { maxAgeMs: 1 });
      now = 4000; // Below the 5s clamp, so the cached value should still be used.
      await service.getMarketPrice(marketInput, { maxAgeMs: 1 });

      expect(fetchMock).toHaveBeenCalledTimes(1);

      jest.spyOn(Date, 'now').mockRestore();
    });

    it('backs off after Yahoo rate limits a symbol', async () => {
      let now = 0;
      jest.spyOn(Date, 'now').mockImplementation(() => now);

      fetchMock.mockResolvedValue(jsonResponse({}, false, 429));

      const first = await service.getMarketPrice(marketInput, {
        forceRefresh: true,
      });
      now = 60_000;
      const second = await service.getMarketPrice(marketInput, {
        forceRefresh: true,
      });

      expect(first).toBeNull();
      expect(second).toBeNull();
      expect(fetchMock).toHaveBeenCalledTimes(1);

      jest.spyOn(Date, 'now').mockRestore();
    });

    it('returns the cached quote during rate-limit backoff', async () => {
      let now = 0;
      jest.spyOn(Date, 'now').mockImplementation(() => now);

      fetchMock
        .mockResolvedValueOnce(
          jsonResponse({
            chart: { result: [{ meta: { regularMarketPrice: 150 } }] },
          }),
        )
        .mockResolvedValueOnce(jsonResponse({}, false, 429));

      const first = await service.getMarketPrice(marketInput, {
        maxAgeMs: 5000,
      });
      now = 10_000;
      const second = await service.getMarketPrice(marketInput, {
        forceRefresh: true,
      });
      now = 60_000;
      const third = await service.getMarketPrice(marketInput, {
        forceRefresh: true,
      });

      expect(first?.toString()).toBe('150');
      expect(second?.toString()).toBe('150');
      expect(third?.toString()).toBe('150');
      expect(fetchMock).toHaveBeenCalledTimes(2);

      jest.spyOn(Date, 'now').mockRestore();
    });
  });
});
