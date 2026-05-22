# packages/shared — Conventions & Context

Shared TypeScript types and utilities consumed by both `apps/api` (NestJS,
`moduleResolution: "nodenext"`) and `apps/web` (Next.js 16, Turbopack). The
package is ESM-only (`"type": "module"`).

## What lives here

Each file is a named export entry in `package.json`:

| Export path                     | File                  | Contents                                           |
| ------------------------------- | --------------------- | -------------------------------------------------- |
| `@finhance/shared`              | `src/index.ts`        | Re-exports everything                              |
| `@finhance/shared/accounts`     | `src/accounts.ts`     | Account types and enums                            |
| `@finhance/shared/assets`       | `src/assets.ts`       | Asset types, `AssetKind`, `LiabilityKind`          |
| `@finhance/shared/brokerage`    | `src/brokerage.ts`    | Brokerage types                                    |
| `@finhance/shared/budgets`      | `src/budgets.ts`      | Budget types                                       |
| `@finhance/shared/currencies`   | `src/currencies.ts`   | Currency codes, `isSupportedReportingCurrencyCode` |
| `@finhance/shared/exchanges`    | `src/exchanges.ts`    | Exchange suffixes, `SUPPORTED_EXCHANGES`           |
| `@finhance/shared/transactions` | `src/transactions.ts` | Transaction types                                  |
| `@finhance/shared/users`        | `src/users.ts`        | User and settings types                            |

## Importing from this package (consumers)

Use the package name — never relative paths outside this package's boundary:

```ts
import type { AssetKind } from "@finhance/shared/assets";
import { SUPPORTED_EXCHANGES } from "@finhance/shared/exchanges";
```

## Internal cross-file imports (within this package)

**Do not use relative imports between files in `src/`.** The two runtimes have
incompatible resolution requirements — `.js` extensions work for the API but
break Turbopack; no extension works for Turbopack but breaks the API.

Instead use `#`-prefixed package imports, defined in `package.json` under
`"imports"`:

```ts
// correct
import { isSupportedReportingCurrencyCode } from '#currencies';
export * from '#exchanges';

// wrong — breaks one runtime or the other
import { ... } from './currencies.js';
import { ... } from './currencies';
```

To add a new file that other files in `src/` need to import:

1. Create the file (`src/mything.ts`).
2. Add an entry to `package.json` `"imports"`: `"#mything": "./src/mything.ts"`.
3. Add an entry to `package.json` `"exports"` if consumers outside this package
   should be able to import it directly.
4. Import it internally as `from '#mything'`.

See `docs/decisions/003-shared-package-hash-imports.md` for the full rationale.

## Testing note

`apps/api` Jest config excludes `@finhance/*` from `transformIgnorePatterns`,
so Jest cannot execute runtime code from this package inside API test files.
Type-only imports are fine (erased at compile time). If you need shared
constants in API tests, duplicate the value locally in the test file.
