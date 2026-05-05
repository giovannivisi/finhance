# finhance

`finhance` is a personal finance workspace built as a monorepo with a NestJS
API, a Next.js web app, and shared TypeScript contracts.

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

## Monorepo layout

```text
apps/
  api/        NestJS + Prisma API
  web/        Next.js App Router frontend
packages/
  shared/     shared DTOs, response types, and import template contracts
```

Useful entry points:

- [apps/api](/Users/giovannivisi/Code/finhance/apps/api)
- [apps/web](/Users/giovannivisi/Code/finhance/apps/web)
- [packages/shared](/Users/giovannivisi/Code/finhance/packages/shared)

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

If you need more API detail, inspect [apps/api/package.json](/Users/giovannivisi/Code/finhance/apps/api/package.json) and the shared Prisma schema at [packages/db/prisma/schema.prisma](/Users/giovannivisi/Code/finhance/packages/db/prisma/schema.prisma).

### Web

The frontend expects `NEXT_PUBLIC_API_URL` to point at the API, not at the web
server.

Example local config in `apps/web/.env.local`:

```bash
NEXT_PUBLIC_API_URL=http://127.0.0.1:3000
```

If this points at the Next.js server instead, the app will receive HTML instead
of API JSON and many pages will fail with API reachability errors.

More web-specific setup notes live in
[apps/web/README.md](/Users/giovannivisi/Code/finhance/apps/web/README.md).

## Private hosted deployment

The intended private hosted shape is:

- `apps/web` on Vercel
- `apps/api` on Render
- Neon as the database

Hosted deployment details live in:

- [docs/deploy/private-hosted.md](/Users/giovannivisi/Code/finhance/docs/deploy/private-hosted.md)
- [render.yaml](/Users/giovannivisi/Code/finhance/render.yaml)

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

Template CSVs are served from:

- [apps/web/public/import-templates](/Users/giovannivisi/Code/finhance/apps/web/public/import-templates)

## Privacy notice configuration

The `/privacy` page is backed by server-side configuration and can render
built-in defaults for strictly local self-hosted work, but managed or mixed
deployments should set explicit privacy configuration.

See the detailed guide in:

- [apps/web/README.md](/Users/giovannivisi/Code/finhance/apps/web/README.md)

## Workflow overview

The app works best when used as a connected loop:

1. complete setup or import an existing dataset
2. maintain accounts, categories, recurring rules, and transactions
3. review the current month with reconciliation and recurring diagnostics
4. compare spending against budgets
5. zoom out with analytics
6. capture snapshots to preserve historical net worth boundaries

## Notes for contributors

- prefer `pnpm` for all workspace commands
- keep web and API contracts aligned through `@finhance/shared`
- preserve the current redesign direction while favoring readability over
  decorative effects
- treat Neon as the intended local database target unless an explicit decision
  changes that
- run lint/build/tests for the surfaces you touch before merging

## License

Private project. All rights reserved.
