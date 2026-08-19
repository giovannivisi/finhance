# Coverage policy

Coverage is a CI quality gate, not a target for meaningless tests. The
repository enforces the following global minimums:

| Package        | Statements | Branches | Functions | Lines |
| -------------- | ---------: | -------: | --------: | ----: |
| API            |        65% |      50% |       70% |   65% |
| Mobile         |        46% |      40% |       55% |   46% |
| Web components |        72% |      63% |       69% |   72% |

Run the same checks locally with:

```bash
pnpm --filter api test:cov
pnpm --filter mobile test:cov
pnpm --filter web test:components:cov
```

## What must be tested

Every change to financial behaviour needs a focused test in the same change.
This includes valuation and performance calculations, transaction lifecycle
operations, request validation, and cache invalidation after a mutation.

The mobile API endpoint and query layers are contract-tested. A new endpoint
or mutation must prove its route, payload, idempotency behaviour where
applicable, query key, and invalidation scope. This protects the complete path
from saving a trade to refreshing brokerage value and performance displays.

API services are tested directly with mocked dependencies. Controller tests
cover delegation and response mapping for financial routes; behaviour and
validation belong in service and DTO tests rather than duplicating Nest's own
decorator runtime.

## Intentional scope

Test files, generated output, and third-party framework code are excluded from
coverage. They do not contain application behaviour.

Mobile coverage intentionally includes all application source files. Native
Expo runtime wiring and purely presentational React Native components are not
hidden from the reported percentage, but are deferred from unit coverage until
a React Native renderer/device test layer is introduced. Their behaviour is
instead exercised through type checks, linting, and end-to-end workflows.

Web component coverage deliberately lists stateful, user-facing components.
Framework route wrappers and presentational primitives are outside that
component suite; business logic must not be placed there without adding an
appropriate test target.

The thresholds are raised only when the suite demonstrates durable coverage.
They must never be reduced merely to make an unrelated change pass.
