# ADR 003 — Internal imports in `@finhance/shared` use `#`-prefixed package imports

## Status

Accepted

## Context

The `packages/shared` package is consumed by two runtimes with incompatible
module resolution requirements:

- **API** (`apps/api`) — TypeScript with `moduleResolution: "nodenext"`, which
  requires explicit `.js` file extensions on all relative imports
- **Web** (`apps/web`) — Next.js 16 + Turbopack, which uses its own bundler
  resolution and cannot resolve `.js` → `.ts` for files that were added after
  the initial Turbopack cache was seeded

Using `.js` extensions satisfies the API but breaks the web. Using no
extension satisfies the web but breaks the API. There is no relative-import
extension that works for both.

## Decision

Internal cross-file imports within `packages/shared/src/` for the two new
modules (`currencies.ts`, `exchanges.ts`) use Node.js **package `imports`**
(`#`-prefixed specifiers), defined in `packages/shared/package.json`:

```json
{
  "imports": {
    "#currencies": "./src/currencies.ts",
    "#exchanges": "./src/exchanges.ts"
  }
}
```

Consumers within the package then import:

```ts
import { isSupportedReportingCurrencyCode } from "#currencies";
export * from "#currencies";
export * from "#exchanges";
```

`#`-prefixed imports resolve through the `imports` field in `package.json`,
which both `nodenext` TypeScript resolution and Turbopack support natively.
They bypass the `.js`-extension ambiguity entirely.

## Consequences

- No extension is needed in the import specifier; the mapping is in one place
  (`package.json`)
- Both the API (TypeScript compilation) and the web (Turbopack bundling) resolve
  correctly without additional configuration
- New files added to `packages/shared/src/` that are referenced internally
  should follow this pattern rather than using relative `.js` imports
- Existing files that already worked with `.js` imports (e.g. `exchanges.ts`
  importing from `./assets.js`) are left unchanged — they resolve correctly in
  practice (exact reason unconfirmed; may be a Turbopack file-watcher or cache
  artifact from when those files were first introduced)
