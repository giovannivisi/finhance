import { AssetKind } from '@finhance/db';
import { EodhdProvider } from '@prices/eodhd.provider';

function jsonResponse(
  body: unknown,
  ok = true,
  status = ok ? 200 : 500,
): Response {
  return {
    ok,
    status,
    json: () => Promise.resolve(body),
    text: () =>
      Promise.resolve(typeof body === 'string' ? body : JSON.stringify(body)),
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

describe('EodhdProvider', () => {
  const provider = new EodhdProvider('test-token');
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
    ['United States', 'aapl', '', 'eodhd:AAPL.US'],
    ['Hamburg', 'vwce', '.hm', 'eodhd:VWCE.XETRA'],
    ['Australia', 'bhp', '.ax', 'eodhd:BHP.AU'],
  ])(
    'maps a %s listing to an exact EODHD symbol',
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
    expect(
      provider.buildMarketSymbol({
        kind: AssetKind.STOCK,
        ticker: '7203',
        exchange: '.T',
        quoteCurrency: 'JPY',
      }),
    ).toBe('yahoo:7203.T');
    expect(provider.getRequestGroup('yahoo:BTC-EUR')).toBe('yahoo');
    expect(provider.getRequestGroup('eodhd:VWCE.XETRA')).toBe('eodhd');
  });

  it('parses the latest exact-listing close', async () => {
    fetchMock.mockResolvedValue(jsonResponse(164.1));

    await expect(
      provider.fetchQuote('eodhd:VWCE.XETRA', 3000),
    ).resolves.toEqual({
      ok: true,
      data: 164.1,
    });

    const url = requestUrl(fetchMock.mock.calls[0][0]);
    expect(url.pathname).toBe('/api/eod/VWCE.XETRA');
    expect(url.searchParams.get('filter')).toBe('last_close');
    expect(url.searchParams.get('fmt')).toBe('json');
    expect(url.searchParams.get('api_token')).toBe('test-token');
  });

  it('accepts a numeric-string latest close', async () => {
    fetchMock.mockResolvedValue(jsonResponse('164.1'));

    await expect(provider.fetchQuote('eodhd:VWCE.HM', 3000)).resolves.toEqual({
      ok: true,
      data: 164.1,
    });
  });

  it('treats a missing or non-positive close as no quote', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(null))
      .mockResolvedValueOnce(jsonResponse(0));

    await expect(provider.fetchQuote('eodhd:VWCE.HM', 3000)).resolves.toEqual({
      ok: true,
      data: null,
    });
    await expect(provider.fetchQuote('eodhd:VWCE.HM', 3000)).resolves.toEqual({
      ok: true,
      data: null,
    });
  });

  it('maps provider quota messages to HTTP 429 semantics', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ message: 'Daily API limit exceeded.' }),
    );

    const result = await provider.fetchQuote('eodhd:VWCE.HM', 3000);

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error('Expected an EODHD provider failure.');
    }
    expect(result.status).toBe(429);
    expect(result.error).toBeInstanceOf(Error);
  });

  it('maps plain-text authentication errors without losing their cause', async () => {
    fetchMock.mockResolvedValue(jsonResponse('Invalid API token.'));

    const result = await provider.fetchQuote('eodhd:VWCE.HM', 3000);

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error('Expected an EODHD provider failure.');
    }
    expect(result.status).toBe(401);
    expect(result.error).toBeInstanceOf(Error);
  });

  it('maps a plain-text missing ticker response to HTTP 404 semantics', async () => {
    fetchMock.mockResolvedValue(jsonResponse('Ticker Not Found.'));

    const result = await provider.fetchQuote('eodhd:VWCE.HM', 3000);

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error('Expected an EODHD provider failure.');
    }
    expect(result.status).toBe(404);
    expect(result.error).toBeInstanceOf(Error);
  });

  it('parses and orders end-of-day series data', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse([
        { close: 103, date: '2026-07-22' },
        { close: 101, date: '2026-07-20' },
        { close: 102, date: '2026-07-21' },
      ]),
    );

    await expect(
      provider.fetchSeries('eodhd:VWCE.HM', '1D', 3000),
    ).resolves.toEqual({
      ok: true,
      data: {
        points: [
          { t: Date.parse('2026-07-21T00:00:00.000Z'), price: 102 },
          { t: Date.parse('2026-07-22T00:00:00.000Z'), price: 103 },
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

  it('keeps a non-JSON HTTP rate-limit status', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 429,
      text: () => Promise.resolve('Rate limit exceeded.'),
    } as unknown as Response);

    const result = await provider.fetchQuote('eodhd:VWCE.HM', 3000);

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error('Expected an EODHD provider failure.');
    }
    expect(result.status).toBe(429);
  });
});
