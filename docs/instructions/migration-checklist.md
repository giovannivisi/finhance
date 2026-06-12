# Prisma Migration Safety Checklist

Run through this before applying any migration to a production database.

## Schema changes

- [ ] **NOT NULL without default on an existing table** — will fail on non-empty tables.
      Add a `@default(...)` in the schema, or make the column nullable first and backfill separately.
- [ ] **Column rename** — Prisma generates `DROP COLUMN` + `ADD COLUMN`, losing all data.
      Use a two-step migration: add new column → backfill → drop old column.
- [ ] **Table rename** — same risk as column rename. Check the generated SQL before applying.
- [ ] **Enum value removal** — removing a value from a Prisma `enum` may fail if rows still use it.
      Check for existing data first.

## Index and constraint changes

- [ ] **New unique constraint on a column that may have duplicates** — migration will fail.
      Verify uniqueness first: `SELECT <col>, COUNT(*) FROM <table> GROUP BY <col> HAVING COUNT(*) > 1`.
- [ ] **Index on a large table** — `CREATE INDEX` in PostgreSQL takes a table-level lock by default.
      Use `CREATE INDEX CONCURRENTLY` (add it manually to the migration SQL) to avoid downtime.

## Data migrations

- [ ] **Backfill in the migration file** — avoid large `UPDATE` statements in migration files on
      production; they hold locks for the duration. Prefer a separate script or background job.
- [ ] **Transaction isolation** — Prisma wraps migrations in a transaction. If the migration mixes
      DDL and DML, verify the transaction boundary is safe for the DB version.

## Before applying

- [ ] Run `prisma migrate diff` and read the generated SQL — does it match your intent?
- [ ] Test on a staging database first (`db:migrate:dev` against a copy of prod data if possible).
- [ ] Confirm a recent DB backup exists.
- [ ] If the migration takes a lock, schedule it during low-traffic hours.

## After applying

- [ ] Run `prisma migrate status` to confirm all migrations are applied and no drift exists.
- [ ] Smoke-test the affected feature end-to-end.
