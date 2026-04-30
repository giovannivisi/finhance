# Phase 0 — Shared DB Extraction

## Objective

Make Prisma a workspace-level concern before any auth work begins.

At the end of this phase:

- `packages/db` is the only owner of Prisma schema, migrations, and generated
  client code
- `apps/api` consumes `@finhance/db`
- the repo is ready for `apps/web` to gain DB-backed auth persistence in phase
  1

Because the current database may be deleted, this phase should prefer a clean
reset/remigrate workflow over a legacy-preserving migration strategy.

## Scope

In scope:

- repo structure for Prisma ownership
- package wiring
- API import updates
- migration command updates
- clean reset of the existing Prisma migration surface if needed

Out of scope:

- Auth.js
- new auth tables
- web-app DB access
- deployment changes

## Implementation

### 1. Create `packages/db`

Add a new workspace package that owns all Prisma artifacts:

- `packages/db/package.json`
- `packages/db/tsconfig.json`
- `packages/db/prisma/schema.prisma`
- `packages/db/prisma/migrations/*`
- `packages/db/src/index.ts`

`src/index.ts` should re-export the generated Prisma client and Prisma types so
consumers import from `@finhance/db` instead of `@prisma/client`.

### 2. Move the existing schema and migrations

Move the current contents of:

- `apps/api/prisma/schema.prisma`
- `apps/api/prisma/migrations/`

into `packages/db/prisma/`.

If the old API-local Prisma location is still needed by scripts temporarily,
keep only a minimal forwarding setup during transition. The final state should
have a single authoritative schema location.

### 3. Update package wiring

- Add `@finhance/db` as a workspace dependency of `apps/api`.
- Add scripts to `packages/db` for:
  - `prisma generate`
  - `prisma migrate dev`
  - `prisma migrate reset`
- Update root and/or app-level scripts so Prisma operations point to
  `packages/db`.
- Update `turbo.json` so the DB package generates before dependent app builds.

### 4. Update API imports

Replace all direct `@prisma/client` imports in `apps/api` with `@finhance/db`.

This includes:

- service files
- modules
- test files
- `PrismaService`
- any explicit Prisma enum or type imports

The goal is not only “runtime still works,” but also “there is no split Prisma
ownership left in the API.”

### 5. Reset database safely

Because existing DB contents may be discarded:

- prefer a clean `migrate reset` against the development database
- ensure the schema starts from the new `packages/db` location
- verify the resulting DB matches the moved migration history

Do not carry forward any legacy workaround whose only purpose was preserving the
current local data.

### 6. Prepare for auth model expansion

Do not add auth tables yet, but this phase should leave the schema in a shape
where phase 1 can add them without further repo-structure refactoring.

That means:

- `packages/db` is stable
- migrations are reproducible
- both apps can later depend on the same generated client

## Acceptance Criteria

- `packages/db` exists and is the only Prisma owner
- `apps/api` compiles against `@finhance/db`
- no `@prisma/client` imports remain in `apps/api/src` or `apps/api/test`
- migrations run from `packages/db`
- a clean DB reset/remigrate succeeds
- `pnpm build` and API tests pass after the extraction

## Verification

Minimum verification for this phase:

- `pnpm --filter @finhance/db exec prisma generate`
- `pnpm --filter @finhance/db exec prisma migrate reset`
- `pnpm --filter api build`
- targeted API tests or the full API test suite

If a repo-wide build remains practical after the extraction, run it as a final
confidence check.

## Risks To Watch

- wide mechanical import churn causing accidental missed files
- broken script paths after moving Prisma ownership
- tests or tools still implicitly assuming `apps/api/prisma`
- generated client output paths drifting between packages

## Deliverables

- new `packages/db` package
- updated API imports and scripts
- cleanly rebuilt local database from the shared schema
