# Contributing

## Prerequisites, project's setup and structure

For info about prerequisites or the project's structure and setup process (local or remote), please refer to the README.md file.

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

See the AGENTS.md file in each app directory for the conventions that apply there, for example:

- [`apps/api/AGENTS.md`](apps/api/CLAUDE.md) — NestJS module structure, DTOs, Prisma patterns, error handling
- [`apps/web/AGENTS.md`](apps/web/CLAUDE.md) — component model, path aliases, UI patterns, CSS conventions
- [`packages/shared/AGENTS.md`](packages/shared/CLAUDE.md) — shared types, internal import rules
