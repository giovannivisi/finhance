# finhance mobile

Native iOS/Android companion app for finhance, built with
[Expo](https://expo.dev) (React Native SDK 54), TypeScript, and
[expo-router](https://docs.expo.dev/router/introduction/). It lives in the
monorepo and consumes the shared API contracts from `@finhance/shared`, so the
client and API can never drift apart silently.

## What it covers

- **Connect** — works with both deployment shapes:
  - **Hosted** (e.g. `https://finhance-web.vercel.app`): the app detects the
    web deployment, opens the system browser for your normal Google/GitHub
    sign-in, and receives a long-lived mobile session token via deep link.
    The token lives in the device keychain and every API call goes through
    the web's `/api/proxy/*`, which exchanges it per request for the same
    short-lived API JWTs a browser session gets.
  - **Self-hosted** (local auth mode): enter the API address directly; the
    URL is verified against `/health` before being saved.
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
validation rule management, and the privacy notice page.

### Hosted sign-in details

The web app exposes two small endpoints for mobile clients
(`apps/web/app/api/mobile/`):

- `GET /api/mobile/health` — public discovery (service + auth mode)
- `GET /api/mobile/authorize?redirect=…` — after the regular Auth.js
  sign-in, mints an HS256 mobile session token (`AUTH_SECRET`-signed,
  audience `finhance-mobile`, default TTL 120 days, configurable via
  `AUTH_MOBILE_TOKEN_TTL`) and hands it to the app through a strictly
  allowlisted deep-link redirect (`finhance://auth`; Expo Go `exp://…/--/auth`
  redirects only outside production or with
  `AUTH_MOBILE_ALLOW_DEV_REDIRECTS=true`)

The API itself never accepts mobile tokens — the proxy verifies them and
mints the usual short-lived ES256 API JWTs upstream. Signing out in the app
deletes the token from the keychain; a 401 from the proxy (expired/invalid
token) automatically returns the app to the sign-in screen.

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

With `--hosted` it impersonates a hosted web deployment instead (data under
`/api/proxy/*` behind a bearer token, plus the `/api/mobile/*` sign-in
endpoints):

```bash
node scripts/mock-api.mjs 4243 --hosted
EXPO_PUBLIC_DEFAULT_SERVER_URL=http://<your-lan-ip>:4243 \
EXPO_PUBLIC_DEFAULT_SERVER_MODE=hosted \
EXPO_PUBLIC_DEFAULT_SERVER_TOKEN=mock-mobile-token pnpm ios
```

`EXPO_PUBLIC_DEFAULT_SERVER_*` auto-connect dev builds on first launch; they
are ignored in production builds and whenever a server is already stored.
Metro inlines `EXPO_PUBLIC_*` values — restart with `--clear` after changing
them.

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
- **iOS uses real system chrome**: the tab bar is expo-router's `NativeTabs`
  (a genuine `UITabBarController` with SF Symbols — translucent glass on
  iOS 18, Liquid Glass automatically on iOS 26), and bottom sheets use a
  system-material blur. Android keeps the custom floating pill bar. A forced
  dark/light preference is mirrored into native chrome via
  `Appearance.setColorScheme`.

## Building for stores

The app is a standard Expo project: use
[EAS Build](https://docs.expo.dev/build/introduction/) (`eas build`) or
`npx expo prebuild` + Xcode/Gradle. `NSAppTransportSecurity` currently allows
plain-HTTP servers because self-hosted APIs on a LAN rarely have TLS — tighten
this if you ship a public build.
