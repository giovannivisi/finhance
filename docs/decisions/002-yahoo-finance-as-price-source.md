# ADR 002 — Yahoo Finance as the sole market price and FX rate source

## Status

Accepted

## Context

The app needs real-time (or near-real-time) prices for:

- Market assets (stocks, bonds, ETFs) to compute current portfolio value
- FX rates to convert multi-currency asset values into the reporting currency

A price provider must be free, require no API key for basic usage, and support
a wide enough range of tickers and currency pairs to be useful across global
markets.

## Decision

Yahoo Finance is used as the sole external price source, queried via the
undocumented `v8/finance/chart/` endpoint. No API key is required. Both
market prices and FX rates use the same endpoint:

- Market price: ticker + exchange suffix (e.g. `CSSPX.DE`, `AAPL`)
- FX rate: currency pair (e.g. `EURUSD=X`, `GBPEUR=X`)
- Crypto: `-USD` pair convention (e.g. `BTC-USD`)

## Consequences

### Caching strategy

Yahoo Finance has no official SLA and rate-limits aggressive polling. The
service applies two caching layers:

1. **In-memory cache** (5 minutes per symbol, per process) — avoids redundant
   HTTP calls within a single server instance
2. **DB-persisted rates** (`fxRate` table, keyed by user + date + pair) —
   manual FX overrides and historical rates survive restarts

### Known gaps

- **Unsupported currency pairs**: ISO 4217 includes currencies Yahoo does not
  cover (e.g. `AWG`, `BTN`). These return 404 and are logged as `WARN`. The
  app degrades gracefully — the affected asset shows its stored value without
  FX conversion.
- **Unofficial API**: Yahoo may change or rate-limit this endpoint without
  notice. If it breaks, a drop-in replacement (e.g. `yfinance`-compatible
  proxy) would be the migration path.
- **Dashboard blocking** (open issue): currently the dashboard waits on live
  Yahoo calls if no DB rate exists for today. The fix — always serve stale
  rates and refresh in the background — is tracked separately.

### Currency validation

The API validates submitted currency codes against `Intl.supportedValuesOf(
'currency')` (ISO 4217, ~162 codes on Node.js 22). Codes outside this set are
rejected at the DTO level. This is intentionally more permissive than Yahoo's
actual coverage — the app accepts any ISO code; Yahoo failures are handled
gracefully at fetch time.
