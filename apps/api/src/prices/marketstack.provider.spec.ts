import { AssetKind } from '@finhance/db';
import { MarketstackProvider } from '@prices/marketstack.provider';

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

function requestUrl(input: Parameters<typeof global.fetch>[0]): URL {
  if (typeof input === 'string') {
    return new URL(input);
  }
  if (input instanceof URL) {
    return input;
  }
  return new URL(input.url);
}

describe('MarketstackProvider', () => {
  const provider = new MarketstackProvider('test-key');
  let originalFetch: typeof global.fetch;
  let fetchMock: jest.MockedFunction<typeof global.fetch>;

  beforeEach(() => {
    originalFetch = global.fetch;
    fetchMock = jest.fn<
      ReturnType<typeof global.fetch>,
      Parameters<typeof global.fetch>
    >();
    global.fetch = fetchMock;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it.each([
    ['Milan', 'csspx', '.mi', 'marketstack:CSSPX@XMIL'],
    ['London', 'vusd', '.l', 'marketstack:VUSD@XLON'],
    ['Hong Kong', '0700', '.hk', 'marketstack:0700@XHKG'],
    ['National Stock Exchange', 'reliance', '.ns', 'marketstack:RELIANCE@XNSE'],
  ])(
    'maps a %s listing to an exact Marketstack symbol',
    (_market, ticker, exchange, expected) => {
      expect(
        provider.buildMarketSymbol({
          kind: AssetKind.STOCK,
          ticker,
          exchange,
          quoteCurrency: 'EUR',
        }),
      ).toBe(expected);
    },
  );

  it('keeps Yahoo routing isolated for crypto and FX', () => {
    expect(
      provider.buildMarketSymbol({
        kind: AssetKind.CRYPTO,
        ticker: 'btc',
        exchange: '_CRYPTO_',
        quoteCurrency: 'eur',
      }),
    ).toBe('yahoo:BTC-EUR');
    expect(provider.buildFxSymbol('eur', 'gbp')).toBe('yahoo:EURGBP=X');
    expect(provider.getRequestGroup('yahoo:BTC-EUR')).toBe('yahoo');
    expect(provider.getRequestGroup('marketstack:CSSPX@XMIL')).toBe(
      'marketstack',
    );
  });

  it('parses the latest exact-listing close', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        data: [
          {
            symbol: 'CSSPX',
            exchange: 'XMIL',
            close: 662.43,
            date: '2026-07-21T00:00:00+0000',
          },
        ],
      }),
    );

    await expect(
      provider.fetchQuote('marketstack:CSSPX@XMIL', 3000),
    ).resolves.toEqual({ ok: true, data: 662.43 });

    const url = requestUrl(fetchMock.mock.calls[0][0]);
    expect(url.pathname).toBe('/v1/exchanges/XMIL/eod/latest');
    expect(url.searchParams.get('symbols')).toBe('CSSPX');
    expect(url.searchParams.get('exchange')).toBeNull();
    expect(url.searchParams.get('access_key')).toBe('test-key');
  });

  it('treats a missing or non-positive close as no quote', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ data: [{ close: null }] }))
      .mockResolvedValueOnce(jsonResponse({ data: [{ close: 0 }] }));

    await expect(
      provider.fetchQuote('marketstack:CSSPX@XMIL', 3000),
    ).resolves.toEqual({ ok: true, data: null });
    await expect(
      provider.fetchQuote('marketstack:CSSPX@XMIL', 3000),
    ).resolves.toEqual({ ok: true, data: null });
  });

  it('maps provider quota errors to HTTP 429 semantics', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        error: {
          code: 'usage_limit_reached',
          message: 'Monthly usage limit reached.',
        },
      }),
    );

    const result = await provider.fetchQuote('marketstack:CSSPX@XMIL', 3000);

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error('Expected a Marketstack provider failure.');
    }
    expect(result.status).toBe(429);
    expect(result.error).toBeInstanceOf(Error);
  });

  it('maps invalid provider symbols to HTTP 404 semantics', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        error: {
          code: 'no_valid_symbols_provided',
          message: 'At least one valid symbol must be provided.',
        },
      }),
    );

    const result = await provider.fetchQuote('marketstack:CSSPX@XMIL', 3000);

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error('Expected a Marketstack provider failure.');
    }
    expect(result.status).toBe(404);
  });

  it('parses and orders end-of-day series data', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        pagination: { count: 3, total: 3 },
        data: [
          { close: 103, date: '2026-07-22T00:00:00+0000' },
          { close: 101, date: '2026-07-20T00:00:00+0000' },
          { close: 102, date: '2026-07-21T00:00:00+0000' },
        ],
      }),
    );

    await expect(
      provider.fetchSeries('marketstack:CSSPX@XMIL', '1D', 3000),
    ).resolves.toEqual({
      ok: true,
      data: {
        points: [
          { t: Date.parse('2026-07-21T00:00:00+0000'), price: 102 },
          { t: Date.parse('2026-07-22T00:00:00+0000'), price: 103 },
        ],
        previousClose: 102,
        latestPrice: 103,
      },
    });
  });

  it('delegates routed FX quotes to Yahoo without exposing the route prefix', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        chart: { result: [{ meta: { regularMarketPrice: 0.86 } }] },
      }),
    );

    await expect(provider.fetchQuote('yahoo:EURGBP=X', 3000)).resolves.toEqual({
      ok: true,
      data: 0.86,
    });
    expect(requestUrl(fetchMock.mock.calls[0][0]).toString()).toContain(
      'EURGBP%3DX',
    );
  });

  it('rejects exchanges that are not explicitly covered by this adapter', () => {
    expect(() =>
      provider.buildMarketSymbol({
        kind: AssetKind.STOCK,
        ticker: 'VWCE',
        exchange: '.HM',
        quoteCurrency: 'EUR',
      }),
    ).toThrow('Unsupported market symbol "VWCE.HM" for Marketstack.');
  });

  it('reports whether an exchange has an exact Marketstack route', () => {
    expect(provider.supportsExchange('.mi')).toBe(true);
    expect(provider.supportsExchange('.HM')).toBe(false);
    expect(provider.supportsExchange('')).toBe(false);
  });

  it('keeps a non-JSON HTTP rate-limit status', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 429,
      json: () => Promise.reject(new SyntaxError('Invalid JSON')),
    } as unknown as Response);

    const result = await provider.fetchQuote('marketstack:CSSPX@XMIL', 3000);

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error('Expected a Marketstack provider failure.');
    }
    expect(result.status).toBe(429);
  });
});
