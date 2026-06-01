# API — Conventions & Context

NestJS 11 monorepo app. TypeScript with `moduleResolution: "nodenext"` — all
relative imports require explicit `.js` extensions. Prisma ORM. PostgreSQL.

## Module structure

Each domain lives in `src/<domain>/` with four files: `controller`, `service`,
`module`, and optionally `dto/`. Modules are wired in `app.module.ts`. Do not
put business logic in controllers — controllers validate input and delegate to
services.

Large legacy services should not receive new unrelated responsibilities:

- `imports/imports.service.ts` currently owns CSV parsing, validation, applying,
  export, and import-key backfill. New import work should prefer extracted
  parser, analyser, applier, exporter, or backfill helpers.
- `recurring/recurring.service.ts` currently owns rule CRUD, materialisation,
  occurrence overrides, monthly review, and cashflow warning logic. New recurring
  work should keep materialisation and review logic in separate helpers where
  practical.

## DTOs and validation

- All request bodies use class-validator + class-transformer decorators
- `@Transform` runs before validators — always account for the transformed value
- Optional nullable fields use `@IsOptional()` + `@IsNotEmpty()` together (a
  present-but-empty string is an error; absent is fine)
- Custom validators live in `src/common/catalog-validators.ts` and delegate to
  `src/common/catalogues.ts` — do not inline catalogue logic into DTOs
- Exchange validation uses the `SUPPORTED_EXCHANGES` allowlist in `catalogues.ts`;
  currency validation uses `Intl.supportedValuesOf('currency')` (ISO 4217)

## Prisma patterns

- Never call `prisma.$queryRaw` — use typed Prisma methods
- Decimal arithmetic uses `Prisma.Decimal` throughout; never convert to `number`
  for financial calculations
- DB transactions for multi-step writes: use `prisma.$transaction(async tx => …)`
  with `Serializable` isolation for anything involving read-then-write on the
  same row

## Error handling

Throw NestJS built-in exceptions (`BadRequestException`, `NotFoundException`,
`ConflictException`, etc.) from service methods — the global filter formats
them correctly. Do not throw plain `Error`.

## Price and FX fetching

**Do not add new critical-path calls to `pricesService.getFxRate` or
`getMarketPrice`** — these make outbound HTTP calls to Yahoo Finance and will
block the response until the external call completes.

**Current state (known issue):** the dashboard currently calls these
synchronously if no DB rate for today exists. This is a tracked bug — read
endpoints should eventually use only DB-persisted values (`lastPrice`,
`lastFxRate`, `fxRate` table) and trigger background refresh separately via
`refreshAssets`.

Do not introduce further synchronous Yahoo calls while this is being fixed.
See `docs/decisions/002-yahoo-finance-as-price-source.md` for the full
rationale.

## Testing

- Jest with `ts-jest`. Test files are `*.spec.ts` alongside source files
- Mock Prisma with typed `jest.Mock` objects — see existing specs for the pattern
- Do not use `@nestjs/testing` `TestingModule` in unit tests; instantiate
  services directly with mock dependencies
- `transformIgnorePatterns` does **not** include `@finhance/*` — this only
  matters for _runtime_ imports (functions and values Jest must execute). Type-only
  imports from the shared package are fine because TypeScript erases them before
  Jest runs. Avoid importing shared runtime code in test files; types are OK

## Shared package imports

Import shared types via the package name (`@finhance/shared`, `@finhance/shared/users`,
etc.) — never via relative paths. See `docs/decisions/003-shared-package-hash-imports.md`.
