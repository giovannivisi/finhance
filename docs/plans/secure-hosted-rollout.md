# Secure Hosted Rollout

## Summary

This document is the master plan for moving `finhance` from a localhost-only
developer tool to a securely hosted application that you can use privately from
desktop and mobile browsers, while keeping the architecture clean enough for a
later public release.

The rollout is intentionally phased. Each phase has its own implementation
document and must be completed and verified before the next one begins.

## Locked Decisions

- Auth foundation: `Auth.js`
- Providers in phase 1: `Google` and `GitHub`
- Initial access policy: one exact allowed email
- Canonical identity model: internal user records, not provider IDs
- Session architecture: Next.js owns the browser session
- Browser/API boundary: browser calls go through a catch-all Next.js proxy
- API auth contract: first-party bearer JWTs
- JWT algorithm from day 1: `ES256`
- JWT key model: asymmetric private/public key pair
- Auth persistence: DB-backed Auth.js sessions
- Prisma ownership: shared internal DB package
- Hosted protection model: real app auth, no temporary external gate
- Release target: independent users, not shared workspaces
- Future client posture: API must remain reusable for non-browser clients
- Initial hosts: Vercel Hobby for web, Render Free for API, Neon for DB
- Data migration posture: current DB can be deleted and rebuilt from scratch
- Fallback rule: if Auth.js is genuinely blocked by Next.js 16, a controlled
  downgrade to a known-compatible Next version is allowed

## Why The Phases Are Split

The work is split to isolate risk:

1. Phase 0 changes Prisma ownership across the repo and is wide but mechanical.
2. Phase 1 establishes the real security boundary and auth architecture.
3. Phase 2 deploys the now-secured app to hosted infrastructure.
4. Phase 3 validates real hosted usage, especially on mobile browsers.
5. Phase 4 prepares the app-shaped experience without rewriting the backend.

Do not merge these concerns into one large implementation pass. The value of
the structure is that each phase has a clean acceptance gate.

## Phase Sequence

### Phase 0 — Shared DB Extraction

Move Prisma schema, migrations, and client generation into `packages/db`, then
switch `apps/api` to consume that shared package.

Exit criteria:

- schema and migrations live under `packages/db`
- `apps/api` builds and tests against `@finhance/db`
- no Prisma ownership ambiguity remains

See: [phase-0-shared-db-extraction.md](/Users/giovannivisi/Code/finhance/docs/plans/phase-0-shared-db-extraction.md)

### Phase 1 — Auth Foundation And Hosted Readiness

Add Auth.js, internal user identity, DB-backed sessions, API JWT verification,
and the catch-all browser proxy. Replace localhost trust with authenticated
identity.

Exit criteria:

- hosted-mode auth works end to end
- browser mutations route through the proxy
- API rejects unauthenticated or invalid hosted requests
- local mode still works intentionally

See: [phase-1-auth-foundation.md](/Users/giovannivisi/Code/finhance/docs/plans/phase-1-auth-foundation.md)

### Phase 2 — Private Deployment

Deploy the secured app to Vercel, Render, and Neon using hosted secrets,
provider callbacks, and production-safe configuration.

Exit criteria:

- hosted login works
- direct anonymous API access is blocked
- core workflows function in hosted mode

See: [phase-2-private-deployment.md](/Users/giovannivisi/Code/finhance/docs/plans/phase-2-private-deployment.md)

### Phase 3 — Hosted QA And Hardening

Treat the hosted deployment as the real QA environment and run desktop/mobile
validation plus security checks.

Exit criteria:

- daily private use is viable from desktop and phone
- no auth, authorization, or session blockers remain
- no major mobile browser usability blockers remain

See: [phase-3-hosted-qa-and-hardening.md](/Users/giovannivisi/Code/finhance/docs/plans/phase-3-hosted-qa-and-hardening.md)

### Phase 4 — App Readiness

Prepare for installable/mobile-app-like usage, starting with PWA capability,
without discarding the hosted browser-first backend architecture.

Exit criteria:

- PWA path is defined and testable
- API auth remains reusable for future direct clients
- no phase 4 work forces a redesign of phases 1 or 2

See: [phase-4-app-readiness.md](/Users/giovannivisi/Code/finhance/docs/plans/phase-4-app-readiness.md)

## Global Engineering Rules

- Keep the Nest API as the only owner of finance-domain business logic.
- Keep the Next.js proxy thin: session enforcement and request forwarding only.
- Do not introduce temporary auth that must be thrown away later.
- Do not weaken local-only protections without simultaneously adding real hosted
  auth enforcement.
- Keep all host-specific behavior env-driven so moving away from Render later is
  straightforward.
- Prefer explicit acceptance criteria and manual verification checklists over
  implicit “looks fine” sign-off.

## Deliverables

This plan set is complete only when the following files exist and stay aligned:

- `docs/plans/secure-hosted-rollout.md`
- `docs/plans/phase-0-shared-db-extraction.md`
- `docs/plans/phase-1-auth-foundation.md`
- `docs/plans/phase-2-private-deployment.md`
- `docs/plans/phase-3-hosted-qa-and-hardening.md`
- `docs/plans/phase-4-app-readiness.md`
