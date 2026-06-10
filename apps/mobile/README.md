# finhance mobile

Native iOS/Android companion app for finhance, built with
[Expo](https://expo.dev) (React Native SDK 54), TypeScript, and
[expo-router](https://docs.expo.dev/router/introduction/). It lives in the
monorepo and consumes the shared API contracts from `@finhance/shared`, so the
client and API can never drift apart silently.

## What it covers

- **Connect** — point the app at a self-hosted finhance API (local auth mode);
  the URL is verified against `/health` before being saved
- **Dashboard** — reporting-currency net worth, assets/liabilities grouped by
  kind, pricing freshness, quote refresh, setup progress, budget pulse
- **Activity** — month-by-month transactions with day grouping, kind/account/
  category filters, free-text search, and per-currency cashflow summary
- **Transactions** — create/edit/delete expenses, income, adjustments,
  transfers (incl. cross-currency with manual FX override), split expenses
  across accounts, original-currency capture, and rule-based category
  auto-matching
- **Wallets** — accounts by type with reconciliation status, account detail
  with diagnostics, adjustment + opening-balance baseline actions, archive/
  restore/delete flows
- **Brokerage** — per-broker workspace with positions, unrealised P/L,
  allocation targets, activity, and buy/sell/dividend/fee recording
- **Budgets** — monthly per-currency summaries, per-category progress,
  month overrides, unbudgeted spending, plan changes effective from a month
- **Analytics** — multi-month income/expense chart, focus-month breakdowns,
  month-over-month movers, category trend sparklines
- **Monthly review** — net worth explanation, warnings, recurring
  expected-vs-actual, budget and reconciliation highlights
- **Recurring** — rules, pause/resume, month exceptions (skip/override),
  manual materialisation
- **Categories / History / Setup / Settings** — taxonomy management, snapshot
  capture + history, setup checklist, reporting currency, theme, hide-money

Deliberately not in v1 (desktop workflows): CSV import/export, expense
validation rule management, and the privacy notice page. Hosted-auth servers
are detected at connect time and rejected with a clear message — the
short-lived web-minted JWT flow has no mobile counterpart yet.

## Development

```bash
pnpm install                      # from the repo root
cd apps/mobile
pnpm dev                          # expo start
pnpm ios                          # expo start --ios (simulator)
pnpm android                      # expo start --android
```

Point the app at an API:

- iOS simulator → `http://127.0.0.1:3000` (simulators share the host network)
- Android emulator → `http://10.0.2.2:3000`
- Physical device → your machine's LAN IP or a private tunnel (e.g. Tailscale)

### Mock API

A self-contained fixture server lets you develop the UI without a database:

```bash
node scripts/mock-api.mjs 4243
EXPO_PUBLIC_DEFAULT_SERVER_URL=http://127.0.0.1:4243 pnpm ios
```

`EXPO_PUBLIC_DEFAULT_SERVER_URL` auto-connects dev builds on first launch; it
is ignored in production builds and whenever a server is already stored.

### Checks

```bash
pnpm check-types   # tsc --noEmit
pnpm lint          # eslint (expo flat config)
pnpm test          # vitest unit tests for the pure logic
pnpm export:check  # full Metro bundle compile (iOS, Hermes)
```

All four also run through Turborepo from the repo root (`pnpm check-types`,
`pnpm lint`, `pnpm test`).

## Architecture

```text
app/                    expo-router routes (file-based, typed)
  (tabs)/               Home · Activity · Budgets · Analytics · More
  transactions/upsert   modal create/edit form
  accounts/ holdings/ budgets/ recurring/ categories/ brokerage/ settings/
src/
  api/                  fetch client, typed endpoints, react-query hooks,
                        server-connection context (AsyncStorage persistence)
  components/ui/        design system: Screen, Card, Button, Sheet, fields…
  components/charts/    react-native-svg charts (bars, breakdowns, sparklines)
  features/             pure per-domain logic (form builders, derivations) —
                        unit-tested with vitest
  lib/                  money/date helpers, enum labels
  theme/                design tokens mirroring the web app's glass aesthetic,
                        dark/light themes, hide-money preference
```

Conventions worth knowing:

- **Server state** lives in TanStack Query; every mutation invalidates the
  affected domains. The query cache is recreated when the server URL changes.
- **Mutations carry idempotency keys** (`Idempotency-Key` header) so flaky
  mobile networks cannot double-post.
- **Native currency stays native**: rows render in their own currency; only
  aggregates use the reporting currency — same model as the web app.
- The UI follows the web design language (mint `#10b981`, glass cards, Inter,
  dark-first with a light theme).

## Building for stores

The app is a standard Expo project: use
[EAS Build](https://docs.expo.dev/build/introduction/) (`eas build`) or
`npx expo prebuild` + Xcode/Gradle. `NSAppTransportSecurity` currently allows
plain-HTTP servers because self-hosted APIs on a LAN rarely have TLS — tighten
this if you ship a public build.
