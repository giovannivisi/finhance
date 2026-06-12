# finhance

`finhance` is a personal finance workspace built as a monorepo with a NestJS
API, a Next.js web app, an Expo (React Native) mobile app, and shared
TypeScript contracts.

The product is designed around a few core ideas:

- keep accounts, transactions, assets, liabilities, categories, and recurring
  definitions in one coherent workspace
- make monthly review and reconciliation explainable instead of opaque
- support import/export round-tripping without treating generated recurring rows
  as ordinary manual history
- connect budgeting, monthly review, setup, analytics, and snapshot history so
  they work as one workflow rather than isolated pages

## Current product surface

The current app includes:

- dashboard and shell navigation with mobile-first tab bar support
- account and category management, including archive and safe delete flows
- transactions and transfers
- assets and liabilities with quote-aware valuation support
- multi-currency reporting with native-currency storage and per-user reporting
  currency
- dedicated brokerage workspaces for broker accounts, including positions,
  operations, activity, and allocation targets
- recurring transaction rules, month overrides, and manual materialization
- monthly budgets with repeating plans and month overrides
- monthly review with reconciliation diagnostics, recurring comparisons, and
  snapshot-aware net worth explanations
- multi-month cashflow analytics
- derived setup checklist and trust reminders
- snapshot history
- CSV import/export for accounts, categories, assets, transactions, recurring
  rules, recurring exceptions, budgets, and budget overrides
- privacy notice support for self-hosted, managed, and mixed deployments
- hide-money preference support in the web UI
- a native mobile companion app (Expo/React Native) for self-hosted APIs,
  covering dashboard, activity, transactions, wallets, brokerage, budgets,
  analytics, monthly review, recurring, categories, snapshots, and settings —
  see `apps/mobile/README.md`

## Product model

The app uses a few domain objects that work together:

- `accounts` are containers such as bank accounts, broker accounts, cards, cash
  wallets, and loans
- `assets` represent things you own or track at a positive value
- `liabilities` represent obligations you owe and reduce net worth
- `transactions` represent money movement through accounts
- `brokerage operations` represent investment actions such as buys, sells,
  dividends, and fees inside a broker account
- `budgets` define monthly spending plans by expense category
- `recurring rules` define expected future activity before it becomes real

One important design choice is that accounts organise assets and liabilities,
but do not change totals by themselves. The value lives in the assets,
liabilities, and transactions attached to them.

## Choosing the right tool

If you are not sure where to put something, use these rules:

- use an `account` when you need a container for activity, reconciliation, or
  grouping
- use an `asset` when you need to track something you own
- use a `liability` when you need to track something you owe
- use a `transaction` when money actually moved
- use a `recurring rule` when something is expected to happen repeatedly but
  has not been posted yet
- use a `budget` when you want to compare spending against a monthly plan

### Accounts

Choose the account type based on the real-world container:

- `BANK`: current accounts, savings accounts, deposit accounts
- `BROKER`: investment accounts that hold securities and cash for trading
- `CARD`: credit cards and charge cards
- `CASH`: physical cash wallets or cash envelopes
- `LOAN`: mortgages, personal loans, student loans, and similar debt accounts
- `OTHER`: anything that does not fit the model above

Practical guidance:

- if you need stocks, ETFs, bonds, or crypto with buy/sell/dividend/fee flows,
  create a `BROKER` account and use the `Brokerage` workspace
- if you only need a simple manual holding with no trading history, a regular
  asset can still work, but the brokerage workspace is the better fit for
  investable positions
- if you need a card balance that can grow or shrink over time, use a `CARD`
  account and attach the liability there
- if you need a longer-lived debt such as a mortgage or personal loan, use a
  `LOAN` account and attach the liability there

### Assets and liabilities

Use asset and liability records based on what you are modelling:

- use asset kind `CASH` for stored cash balances outside investment positions
- use asset kinds `STOCK`, `BOND`, or `CRYPTO` for market positions
- use asset kinds `REAL_ESTATE`, `PENSION`, `COMMODITY`, or `OTHER` for manual
  valuation tracking
- use liability kind `DEBT` for loans, credit balances, and similar borrowing
- use liability kind `TAX` for taxes owed
- use liability kind `OTHER` for obligations that are neither debt nor tax

Practical guidance:

- if you need a liability that increases as you spend or borrow, model it as a
  liability, usually `DEBT`, and place it in a `CARD` or `LOAN` account as
  appropriate
- do not model debt as a negative asset unless you intentionally want to bypass
  the liability workflow
- if you need market holdings with operation history, prefer brokerage instead
  of creating standalone manual stock assets

### Transactions and brokerage operations

Use the recording tool that matches the source of truth:

- use `transactions` for income, expenses, transfers, and adjustments across
  normal accounts
- use `brokerage operations` inside a broker account for buys, sells,
  dividends, and fees
- use `transfers` when money moved between your own accounts

Practical guidance:

- cash moving into or out of a broker account can appear as regular account
  activity, while trading activity itself should be recorded through brokerage
  operations
- dividends and brokerage fees should be recorded from the brokerage workspace,
  not as ordinary ad hoc manual transactions, so the investment history stays
  coherent
- if a purchase was settled in one currency but charged to an account in
  another, keep the account-side settled amount as the real transaction amount
  and use the optional original-currency fields for the merchant-side amount
- if money moved between two of your own accounts with different currencies,
  use a cross-currency `TRANSFER` instead of faking it as two unrelated rows

### Budgets and recurring rules

- use `budgets` for monthly category targets
- use `recurring rules` for rent, salary, subscriptions, instalments, and other
  predictable future movements
- use `month overrides` when a single month should differ from the default plan

## Common modelling examples

- salary paid into a bank account: create an `INCOME` transaction
- rent paid from a bank account: create an `EXPENSE` transaction and budget the
  category if you want monthly tracking
- moving money from current account to savings: create a `TRANSFER`
- buying an ETF: create or use a `BROKER` account, then record a brokerage
  `BUY`
- receiving a dividend: record a brokerage `DIVIDEND`
- credit card balance: use a `CARD` account plus a liability, usually `DEBT`
- mortgage balance: use a `LOAN` account plus a liability, usually `DEBT`
- taxes owed but not yet paid: create a liability with kind `TAX`

## Multi-currency model

`finhance` now treats currency in two layers:

- `native currency` is the real currency of the account, asset, liability, or
  transaction
- `reporting currency` is the currency used for aggregate totals such as net
  worth and portfolio-level summaries

Important rules:

- never use reporting currency to overwrite native truth
- row-level records stay in their native currency
- converted totals are a reporting layer on top, not a replacement for source
  data

### Currently supported currencies

There are two answers here:

- at the product/settings level, the current reporting-currency selector offers:
  `EUR`, `USD`, `GBP`, and `CHF`
- at the API/data-validation level, the system accepts any valid 3-letter
  uppercase currency code

That means:

- accounts, assets, liabilities, imports, and transactions can technically use
  currencies beyond the four reporting presets, as long as they are valid
  3-letter codes
- the user-facing reporting-currency choice is currently limited to the four
  curated options above

### FX source

- FX conversion uses Yahoo Finance, through the same quote service family used
  for market prices
- live FX can be used by default
- manual FX overrides can be saved for manual transactions and cross-currency
  transfers
- dated FX records are persisted so historical reporting does not blindly reuse
  today's rates

### How multi-currency shows up in the app

- `Dashboard`: summary totals are shown in reporting currency, while asset and
  liability rows stay native
- `Brokerage`: workspace-level totals use reporting currency, while positions,
  cash, and activity remain native/account-currency first
- `History`: snapshots store reporting metadata plus native per-currency totals
  for newer captures
- `Monthly close`: top-level explanation uses reporting-currency language, but
  diagnostics and warnings still reflect native-currency reality
- `Transactions` and `Activity`: the canonical booked amount remains the
  settled account-side amount; optional native/original-currency fields add
  merchant-side context
- `Budgets` and `Analytics`: per-currency sections remain authoritative; the
  reporting-currency overview layer is only partially implemented at the moment

### Current limitations

- historical snapshots captured before the new native-currency snapshot format
  cannot be recomputed perfectly for arbitrary reporting-currency changes
- reporting-currency overview strips are not yet fully realised across all
  budgets and analytics surfaces
- split-funded expenses remain same-currency settlement only for now

## Monorepo layout

```text
apps/
  api/        NestJS + Prisma API
  web/        Next.js App Router frontend
  mobile/     Expo (React Native) iOS/Android app
packages/
  db/         Prisma schema, migrations, and generated client
  shared/     shared DTOs, response types, and import template contracts
```

## Stack

- Node.js 20.9+
- pnpm 9
- TypeScript
- Turborepo
- NestJS
- Prisma
- Next.js App Router
- React 19

## Local development

Install dependencies from the repo root:

```bash
pnpm install
pre-commit install
pre-commit install --hook-type commit-msg
```

Run the repo in development:

```bash
pnpm dev
```

That starts the workspace tasks through Turborepo. The default local ports are:

- web: `http://localhost:3001`
- api: `http://127.0.0.1:3000`

If you prefer to run the apps separately:

```bash
pnpm --filter api dev
pnpm --filter web dev
```

## Environment expectations

### API

The API uses Prisma and expects a real `DATABASE_URL`.

Important local assumption for this repo:

- local development is intended to use Neon
- do not assume a local Postgres container is part of the normal workflow

Typical API routine:

```bash
pnpm --filter @finhance/db run prisma:generate
pnpm --filter api dev
```

Only run migrations when you are intentionally changing the schema:

```bash
pnpm --filter @finhance/db run prisma:migrate:dev
```

If you pull code that includes new Prisma migrations, apply them before
starting or exercising the API:

```bash
pnpm db:migrate:deploy
```

For normal local development, `pnpm db:migrate:dev` is also acceptable. If you
skip this step, Prisma will fail with missing-column errors such as
`Transaction.splitGroupId`.

If you need more API detail, inspect `apps/api/package.json` and the shared Prisma schema at `packages/db/prisma/schema.prisma`.

### Web

The frontend expects `NEXT_PUBLIC_API_URL` to point at the API, not at the web
server.

Example local config in `apps/web/.env.local`:

```bash
NEXT_PUBLIC_API_URL=http://127.0.0.1:3000
```

If this points at the Next.js server instead, the app will receive HTML instead
of API JSON and many pages will fail with API reachability errors.

More web-specific setup notes live in `apps/web/README.md`.

## Private hosted deployment

The intended private hosted shape is:

- `apps/web` on Vercel
- `apps/api` on Render
- Neon as the database

Hosted deployment details live in:

- `docs/deploy/private-hosted.md`
- `render.yaml`

The hosted rollout depends on the Phase 1 auth foundation:

- web-owned Auth.js sessions
- Google + GitHub providers
- single bootstrap email allowlist at first access
- short-lived ES256 API JWTs minted by the web app

Before the first hosted deploy, and after any future Prisma migration changes,
run:

```bash
pnpm db:migrate:deploy
```

## Common commands

From the repo root:

```bash
pnpm dev
pnpm build
pnpm lint
pnpm test
pnpm check-types
```

App-specific commands:

```bash
pnpm --filter api build
pnpm --filter api test
pnpm --filter api test:e2e

pnpm --filter web build
pnpm --filter web lint
pnpm --filter web test
pnpm --filter web test:e2e
```

## Testing

The repo currently uses multiple layers of tests:

- API unit tests with Jest
- API route/e2e tests with Jest + Supertest
- API Prisma-backed integration coverage for migration-sensitive flows
- web helper tests with Node's built-in test runner
- web component tests with Vitest
- web Playwright smoke coverage

The top-level `pnpm test` runs the Turborepo `test` task across packages.

## Import/export notes

The import/export workflow is intentionally domain-aware:

- recurring-generated transactions are not exported as ordinary transactions
- recurring rules and recurring exceptions are exported separately
- budgets and budget overrides are part of the round-trip package
- import preview batches are short-lived and must be applied explicitly

Template CSVs are served from `apps/web/public/import-templates`.

### Recommended first import order

If you import a full package together in one preview/apply batch, you do not
need to manually order the files. The backend applies them in dependency-aware
steps.

If you import files in separate passes, then order only matters where one file
references `importKey` values created by another:

1. `accounts.csv`
2. `categories.csv`
3. `expenseCategoryHierarchy.csv`
4. any files that depend on accounts and/or categories:
   `expenseValidationRules.csv`, `assets.csv`, `recurringRules.csv`,
   `budgets.csv`, `transactions.csv`
5. `recurringExceptions.csv` after `recurringRules.csv`
6. `budgetOverrides.csv` after `budgets.csv`

Practical notes:

- if your package does not include one of those files, skip it
- `transactions.csv` depends on referenced accounts and, for explicit category
  links, referenced categories already existing
- `expenseCategoryHierarchy.csv` and `expenseValidationRules.csv` both depend
  on the expense categories already being imported
- `transactions.csv` does not need `expenseValidationRules.csv` first when it
  already carries explicit `categoryImportKey` values
- `budgetOverrides.csv` depends on `budgets.csv`, and
  `recurringExceptions.csv` depends on `recurringRules.csv`

## Privacy notice configuration

The `/privacy` page is backed by server-side configuration and can render
built-in defaults for strictly local self-hosted work, but managed or mixed
deployments should set explicit privacy configuration.

See the detailed guide in `apps/web/README.md`.

## Workflow overview

The app works best when used as a connected loop:

1. complete setup or import an existing dataset
2. maintain accounts, categories, recurring rules, and transactions
3. review the current month with reconciliation and recurring diagnostics
4. compare spending against budgets
5. zoom out with analytics
6. capture snapshots to preserve historical net worth boundaries

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for branch conventions, commit prefixes,
pre-commit hooks, and PR guidelines.

## License

AGPL-3.0 — see [LICENSE](LICENSE.md).
