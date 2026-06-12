# Contributing

## Prerequisites

- Node.js 20–22
- pnpm 9
- PostgreSQL (local or Docker)
- Python + [pre-commit](https://pre-commit.com) (`pip install pre-commit`)

## Local setup

```bash
pnpm install
pre-commit install
pre-commit install --hook-type commit-msg
pnpm db:generate
pnpm db:migrate:reset --force
```

Start the dev servers (two terminals):

```bash
pnpm --filter api dev
pnpm --filter web dev
```

Open `http://localhost:3001`.

## Project structure

```
apps/api      NestJS API (TypeScript, moduleResolution: nodenext)
apps/web      Next.js 16 frontend (App Router, Turbopack)
packages/db   Prisma schema and migrations
packages/shared  Shared types consumed by both apps
```

## Branches and commits

Branch names follow `<prefix>/<short-slug>`:

```
feat/add-budget-picker
fix/fx-rate-rounding
chore/bump-prisma
```

Commit messages must start with one of these prefixes:

| Prefix     | Use when                                 |
| ---------- | ---------------------------------------- |
| `feat`     | adding new functionality                 |
| `fix`      | correcting broken behaviour              |
| `perf`     | improving speed or efficiency            |
| `refactor` | restructuring without changing behaviour |
| `chore`    | maintenance, deps, config                |
| `docs`     | documentation only                       |
| `test`     | adding or fixing tests                   |
| `ci`       | CI/CD pipeline changes                   |
| `style`    | formatting, whitespace — no logic change |

The `commit-msg` hook enforces this automatically. If unsure, `chore` is the fallback.

## Pre-commit hooks

The following checks run automatically on every commit:

- Trailing whitespace and end-of-file fixes
- Prettier formatting
- Prisma schema formatting (when `schema.prisma` is staged)
- ESLint (API and web, when relevant files are staged)
- Unit tests (API and web, when relevant files are staged)
- Commit message prefix validation

If a hook modifies files, stage the changes (`git add -u`) and commit again.

## Pull requests

Use the PR template — it prompts for _What_, _Why_, _Test plan_, and _Breaking changes_. Keep the title short and prefixed the same way as commits (e.g. `feat: add budget currency picker`).

## Code conventions

See the CLAUDE.md file in each app directory for the conventions that apply there:

- [`apps/api/CLAUDE.md`](apps/api/CLAUDE.md) — NestJS module structure, DTOs, Prisma patterns, error handling
- [`apps/web/CLAUDE.md`](apps/web/CLAUDE.md) — component model, path aliases, UI patterns, CSS conventions
- [`packages/shared/CLAUDE.md`](packages/shared/CLAUDE.md) — shared types, internal import rules
