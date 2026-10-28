# Expo CLI dependency audit exception

The pull request and main-branch audit temporarily accepts **GHSA-mrhx-c7xc-m3w5**
for `zod@3.25.76` only when every reported path starts at `apps/mobile` and
ends with the direct dependency `@expo/cli > zod`. The complete high/critical
audit report remains in the CI log. The scheduled moderate-level audit remains
unchanged and continues to report the advisory.

Expo CLI uses this dependency for development-tool schemas. The advisory
describes possible memory exhaustion when oversized collections are validated;
the exception does not establish that the CLI is immune. Expo requires Zod 3,
and forcing Zod 4 into the current CLI breaks its MCP schema conversion. This
temporary, limited acceptance lets the application receive other security
updates while a compatible upstream fix is unavailable.

Review by **11 November 2026**. CI rejects the exception from 12 November UTC.
Remove it as soon as Expo no longer requires the affected dependency, or renew
it only after reassessing the dependency paths and risk.

The audit uses pnpm 11.7.0, which reports at most 100 paths per package version.
CI rejects a list at that limit because it may be truncated, rejects missing or
unexpected paths and versions, and fails if any other high or critical advisory
is present. Registry errors and inconsistent audit results also fail the check.
Review the path limit and policy before changing the pnpm version.
