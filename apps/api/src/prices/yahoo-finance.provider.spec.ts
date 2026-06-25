import { BadRequestException } from '@nestjs/common';
import { AssetKind } from '@finhance/db';
import { YahooFinanceProvider } from '@prices/yahoo-finance.provider';

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

describe('YahooFinanceProvider', () => {
  const provider = new YahooFinanceProvider();
  let originalFetch: typeof global.fetch;
  let fetchMock: jest.Mock;

  beforeEach(() => {
    originalFetch = global.fetch;
    fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof global.fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it.each([
    ['United States', 'aapl', '', 'AAPL'],
    ['Italy', 'enel', '.mi', 'ENEL.MI'],
    ['Japan', '7203', '.t', '7203.T'],
  ])(
    'maps a %s listing without exchange-specific application logic',
    (_market, ticker, exchange, expected) => {
      expect(
        provider.buildMarketSymbol({
          kind: AssetKind.STOCK,
          ticker,
          exchange,
          quoteCurrency: 'USD',
        }),
      ).toBe(expected);
    },
  );

  it('maps crypto and FX symbols using Yahoo conventions', () => {
    expect(
      provider.buildMarketSymbol({
        kind: AssetKind.CRYPTO,
        ticker: 'btc',
        exchange: '_CRYPTO_',
        quoteCurrency: 'eur',
      }),
    ).toBe('BTC-EUR');
    expect(provider.buildFxSymbol('eur', 'gbp')).toBe('EURGBP=X');
  });

  it('rejects symbols outside the provider syntax', () => {
    expect(() =>
      provider.buildMarketSymbol({
        kind: AssetKind.STOCK,
        ticker: 'INVALID/SYMBOL',
        exchange: '',
        quoteCurrency: 'USD',
      }),
    ).toThrow(BadRequestException);
  });

  it('parses a quote response', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        chart: { result: [{ meta: { regularMarketPrice: 191.25 } }] },
      }),
    );

    await expect(provider.fetchQuote('AAPL', 3000)).resolves.toEqual({
      ok: true,
      data: 191.25,
    });
  });

  it('returns an HTTP failure without leaking transport details', async () => {
    fetchMock.mockResolvedValue(jsonResponse({}, false, 429));

    await expect(provider.fetchQuote('AAPL', 3000)).resolves.toEqual({
      ok: false,
      status: 429,
    });
  });

  it('parses series data and ignores missing close values', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        chart: {
          result: [
            {
              meta: { chartPreviousClose: 100 },
              timestamp: [10, 20, 30],
              indicators: { quote: [{ close: [101, null, 103] }] },
            },
          ],
        },
      }),
    );

    await expect(provider.fetchSeries('AAPL', '1D', 3000)).resolves.toEqual({
      ok: true,
      data: {
        points: [
          { t: 10_000, price: 101 },
          { t: 30_000, price: 103 },
        ],
        previousClose: 100,
        latestPrice: 103,
      },
    });
  });
});
