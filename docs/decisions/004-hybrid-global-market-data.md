# ADR 004 — Hybrid global market-data providers

## Status

Accepted

## Context

The original Yahoo Finance adapter uses an undocumented endpoint. In July 2026,
valid `CSSPX.MI` and `VWCE.HM` requests consistently returned HTTP 429 from both
hosted and local egress. The application amplified the problem by polling quote
and one-day history endpoints, then represented an all-symbol refresh failure as
a normal response with `updatedCount: 0`.

Replacing Yahoo with an adapter for only those two exchanges would leave the
rest of the application's global exchange catalogue exposed to the same fault.
No single affordable provider considered for this change publishes exact
coverage for every catalogue venue. The replacement must therefore preserve
the whole catalogue, select exact listings, isolate upstream failures, avoid
background request storms, retain the last known price on failure, and make
failures visible to operators and users.

## Decision

- `MARKET_DATA_PROVIDER=hybrid` is the hosted configuration.
- Marketstack handles every application exchange present in its published
  coverage. Its adapter translates persisted Yahoo-style suffixes to exact
  Marketstack exchange identifiers and sends the ticker and exchange filter
  separately.
- EODHD handles the complementary exchanges in the application catalogue using
  its `CODE.EXCHANGE` identifiers. This includes Hamburg (`VWCE.HM`).
- Yahoo remains the route for FX, crypto, and Tokyo listings, whose `.T` suffix
  it supports directly. Marketstack, EODHD, and Yahoo have independent circuit
  breakers, so one upstream's rate limit does not disable the others.
- Automated coverage iterates the API's full accepted exchange allowlist and
  fails if any entry cannot be routed. Milan and Hamburg remain explicit
  regression cases.
- Ordinary dashboard and compatibility valuation reads use persisted quotes and
  stored FX only. `POST /assets/refresh` is the operation that contacts upstream
  providers and advances `lastPriceAt` after a usable positive price.
- A total market-price failure returns HTTP 503 and preserves stored prices. A
  partial refresh persists successful quotes and returns a structured warning
  for failed symbols. Provider, reason, symbol, and status are logged without
  credentials.
- Web and mobile clients do not interval-poll valuation or one-day performance
  endpoints. A stale snapshot may trigger one automatic refresh attempt; users
  can explicitly retry.

## Consequences

- Hosted deployments require server-only `EODHD_API_TOKEN` and
  `MARKETSTACK_API_KEY` credentials. Both must remain absent from web and mobile
  bundles.
- The global adapters provide the latest available end-of-day close rather than
  claiming an intraday streaming quote. The UI describes persisted price
  snapshots accordingly.
- Provider quotas correspond to deliberate refresh or chart-loading actions,
  not background polling. Deployers must choose provider plans that fit their
  symbol, exchange, history, and licensing requirements.
- `MARKET_DATA_PROVIDER=yahoo` remains available as a no-key local fallback and
  rollback path, but it retains the availability risk documented in ADR 002.
