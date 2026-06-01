#!/usr/bin/env python3
"""
Migration safety checker for Prisma SQL migrations.

Catches patterns that are risky in production and enforces patterns
that have been established as correct in this codebase.

Errors (blocks commit):
  - CREATE INDEX without CONCURRENTLY on an existing table (table-level lock)
  - ADD COLUMN NOT NULL without DEFAULT (fails on non-empty tables)
  - ALTER COLUMN SET NOT NULL without a preceding UPDATE backfill (fails if NULLs exist)

Warnings (passes, but printed for review):
  - DROP TABLE / DROP COLUMN (destructive — verify data has been migrated)
"""

import re
import sys
from pathlib import Path


def extract_new_tables(sql: str) -> set:
    """
    Return table names created in this migration file.
    These are safe to index without CONCURRENTLY because they are empty.
    """
    return set(re.findall(
        r'CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?"?(\w+)"?',
        sql, re.IGNORECASE
    ))


def check_index_without_concurrently(sql: str, new_tables: set) -> list:
    """
    Flag CREATE INDEX (or CREATE UNIQUE INDEX) without CONCURRENTLY on existing
    tables. PostgreSQL takes a table-level lock during a standard index build,
    blocking reads and writes for the duration.

    Indexes on newly created tables in the same migration are fine — those
    tables are empty so there is nothing to lock against.
    """
    errors = []
    pattern = re.compile(
        r'CREATE\s+(?:UNIQUE\s+)?INDEX\b',
        re.IGNORECASE
    )
    for match in pattern.finditer(sql):
        snippet = sql[match.start():match.start() + 150]
        if re.search(r'\bCONCURRENTLY\b', snippet, re.IGNORECASE):
            continue
        on_match = re.search(r'\bON\b\s+"?(\w+)"?', snippet, re.IGNORECASE)
        if not on_match:
            continue
        table = on_match.group(1)
        if table not in new_tables:
            line = sql[:match.start()].count('\n') + 1
            errors.append((
                line,
                f"CREATE INDEX without CONCURRENTLY on existing table '{table}'. "
                "Use CREATE INDEX CONCURRENTLY to avoid a table-level lock."
            ))
    return errors


def check_not_null_without_default(sql: str) -> list:
    """
    Flag ADD COLUMN NOT NULL without a DEFAULT value.
    PostgreSQL will reject this on a non-empty table because existing rows
    would have no value for the new column.

    The correct approach is either:
      - ADD COLUMN ... NOT NULL DEFAULT <value>
      - ADD COLUMN ... (nullable), backfill, then ALTER COLUMN SET NOT NULL
    """
    errors = []
    for match in re.finditer(
        r'ADD\s+COLUMN\s+(?:IF\s+NOT\s+EXISTS\s+)?',
        sql, re.IGNORECASE
    ):
        rest = sql[match.start():]
        end = re.search(r'[;,]|\n\s*\n', rest)
        col_def = rest[:end.start()] if end else rest[:300]
        if (re.search(r'\bNOT\s+NULL\b', col_def, re.IGNORECASE)
                and not re.search(r'\bDEFAULT\b', col_def, re.IGNORECASE)):
            line = sql[:match.start()].count('\n') + 1
            col_match = re.search(r'"?(\w+)"?\s+\w', col_def)
            col_name = col_match.group(1) if col_match else '?'
            errors.append((
                line,
                f"ADD COLUMN '{col_name}' NOT NULL without DEFAULT — "
                "will fail on non-empty tables. Add a DEFAULT or backfill first."
            ))
    return errors


def check_set_not_null_without_backfill(sql: str) -> list:
    """
    Flag ALTER COLUMN SET NOT NULL when no UPDATE statement appears earlier
    in the migration. Setting a column NOT NULL on an existing table requires
    that no rows have NULL in that column — a backfill UPDATE ensures this.

    The established pattern in this codebase (e.g. 20260417103000) is:
      UPDATE "Table" SET "col" = <default> WHERE "col" IS NULL;
      ALTER TABLE "Table" ALTER COLUMN "col" SET NOT NULL;
    """
    errors = []
    set_not_null_matches = list(re.finditer(
        r'ALTER\s+COLUMN\s+"?(\w+)"?\s+SET\s+NOT\s+NULL',
        sql, re.IGNORECASE
    ))
    if not set_not_null_matches:
        return errors
    has_update = bool(re.search(r'\bUPDATE\b', sql, re.IGNORECASE))
    for match in set_not_null_matches:
        if not has_update:
            line = sql[:match.start()].count('\n') + 1
            col = match.group(1)
            errors.append((
                line,
                f"SET NOT NULL on '{col}' without a preceding UPDATE backfill — "
                "existing NULL rows will cause this to fail in production."
            ))
    return errors


def check_destructive_ops(sql: str) -> list:
    """
    Warn on DROP TABLE or DROP COLUMN. These are sometimes correct (e.g.
    removing a deprecated column after a two-step migration) but should
    always be reviewed consciously.
    """
    warnings = []
    for match in re.finditer(r'\bDROP\s+(TABLE|COLUMN)\b', sql, re.IGNORECASE):
        line = sql[:match.start()].count('\n') + 1
        op = sql[match.start():match.start() + 50].split('\n')[0].strip()
        warnings.append((line, f"{op} — verify data has been migrated if needed."))
    return warnings


def check_file(filepath: str):
    sql = Path(filepath).read_text()
    new_tables = extract_new_tables(sql)
    errors = (
        check_index_without_concurrently(sql, new_tables)
        + check_not_null_without_default(sql)
        + check_set_not_null_without_backfill(sql)
    )
    warnings = check_destructive_ops(sql)
    return errors, warnings


def main():
    files = [f for f in sys.argv[1:] if f.endswith('.sql')]
    if not files:
        sys.exit(0)

    total_errors = 0
    total_warnings = 0

    for filepath in files:
        errors, warnings = check_file(filepath)
        if errors or warnings:
            print(f"\n📄 {filepath}")
            for line, msg in warnings:
                print(f"  ⚠️  line {line}: {msg}")
                total_warnings += 1
            for line, msg in errors:
                print(f"  ❌ line {line}: {msg}")
                total_errors += 1

    if total_warnings and not total_errors:
        print(f"\n⚠️  {total_warnings} warning(s) — review before applying to production.")

    if total_errors:
        print(f"\n❌ {total_errors} migration error(s). Fix before committing.")
        sys.exit(1)

    sys.exit(0)


if __name__ == "__main__":
    main()
