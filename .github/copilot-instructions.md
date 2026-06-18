# Copilot instructions

## Commit messages

All commit messages must start with one of these prefixes followed by a colon
and a short lowercase description:

| Prefix     | Use when                                              |
| ---------- | ----------------------------------------------------- |
| `feat`     | adding new**user-facing** functionality               |
| `fix`      | correcting broken behaviour                           |
| `perf`     | improving speed or efficiency                         |
| `refactor` | restructuring without changing behaviour              |
| `chore`    | maintenance, deps, config                             |
| `docs`     | documentation — READMEs, ADRs, comments, CONTRIBUTING |
| `test`     | adding or fixing tests                                |
| `ci`       | CI/CD pipeline changes                                |
| `style`    | formatting, whitespace — no logic change              |

### Common mistakes

- `feat` is strictly for user-facing features. Any documentation file
  (README, CONTRIBUTING.md, ADR, AGENTS.md) is `docs:`.
- Scopes (`feat(scope):`) are rarely needed. Never use a scope that repeats
  the prefix (`docs(docs):` is redundant). Omit the scope unless it
  meaningfully narrows the context (e.g. `fix(brokerage):`).
- If unsure, `chore` is the fallback.

## Branch names

Follow `<prefix>/<short-slug>` using the same prefix list:

```
feat/add-budget-picker
fix/fx-rate-rounding
docs/add-contributing-guide
```
