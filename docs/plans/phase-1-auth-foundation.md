# Phase 1 — Auth Foundation

## Objective

Replace localhost-only trust with real authenticated identity and make the app
safe to expose on the public internet for private use.

At the end of this phase:

- the browser signs in through Auth.js
- sessions are DB-backed
- the web app proxies browser-side authenticated API traffic
- the Nest API authenticates bearer JWTs and resolves the real owner from them
- hosted mode no longer depends on loopback-only assumptions

This is the critical security phase. Do not mix it with deployment work.

## Scope

In scope:

- Auth.js integration
- internal auth/user schema
- session persistence
- browser/API proxy layer
- JWT issuing and verification
- hosted-mode API auth enforcement
- local-dev compatibility

Out of scope:

- production hosting setup
- PWA/native work
- shared workspaces or multi-user collaboration features

## Architecture

### Canonical identity

Use an internal app user model as the canonical identity.

Provider identities from Google and GitHub must attach to that internal user,
not replace it. The API and domain ownership model must depend on the internal
user ID only.

### Session ownership

The Next.js app owns the browser session.

That means:

- login/logout happen in the web app
- browser cookies represent the web session
- the browser does not authenticate directly against Nest

### API trust model

The Nest API authenticates short-lived first-party bearer JWTs minted by the web
layer.

That means:

- the API auth contract is already reusable for future direct clients
- the proxy is not the source of business truth, only the source of authenticated
  browser forwarding

### Token model

Use `ES256` from day 1.

- web app holds the private signing key
- API holds the public verification key
- include a `kid` header for future rotation
- use short token TTLs

Do not introduce an HS256 transitional phase.

## Data Model

### Auth models

Add auth-related models to the shared schema, but avoid Prisma model-name
collisions with the finance-domain `Account`.

Use explicit auth model names, for example:

- `AuthUser`
- `AuthProviderAccount`
- `AuthSession`
- `AuthVerificationToken`

The exact names may vary, but they must not collide with existing finance-domain
models.

### Access model

Persist access state in DB:

- allowed/blocked
- created/updated timestamps
- optional minimal role column if useful for future extension

Use env only to bootstrap the first allowed email. After first login, access
must become DB-driven.

## Implementation

### 1. Add Auth.js to `apps/web`

Install and wire:

- Auth.js
- Prisma adapter
- provider configuration for Google and GitHub

Use DB-backed sessions.

In hosted mode:

- cookies must be `HttpOnly`
- cookies must be `Secure`
- use a safe `SameSite` setting consistent with OAuth callback behavior

### 2. Enforce bootstrap access policy

At sign-in time:

- reject users with unverified emails
- allow only the exact configured bootstrap email on first access
- persist the allowed user in DB
- after persistence, rely on DB access flags for future logins

The system must support broadening this later without redesigning identity.

### 3. Create a catch-all authenticated proxy

Add a single proxy route under the web app for browser-side API access.

Responsibilities:

- require a valid Auth.js session
- resolve the internal user
- mint a short-lived ES256 JWT for the API
- forward request method, query, headers, and body
- stream multipart requests without buffering them into memory
- strip browser cookies and session-sensitive headers before forwarding
- preserve idempotency and content headers where relevant

Non-responsibilities:

- no business logic duplication
- no domain authorization decisions
- no data ownership rules

### 4. Split browser and server API access paths

Do not solve phase 1 by changing one helper globally.

Instead, introduce an explicit split:

- browser-side callers use the proxy path
- server-side reads and server-side web logic use a server-side API client path

The implementation can share low-level code, but the two paths must be designed
intentionally and tested separately.

### 5. Add JWT verification to Nest

Introduce API-side auth handling that:

- reads bearer tokens
- validates signature with the public key
- validates issuer, audience, subject, and expiry
- attaches authenticated principal data to the request

Use this principal to resolve the effective owner ID in hosted mode.

### 6. Refactor request owner resolution

Update the owner-resolution path so:

- local mode can still use the explicit local-dev owner
- hosted mode must require an authenticated principal
- any direct use of `resolveLocalDevOwnerId()` in hosted paths is removed

Audit all current direct call sites and move them behind the unified
owner-resolution mechanism.

### 7. Extend bootstrap/runtime safety

Update bootstrap/runtime config to:

- distinguish local and hosted auth modes
- allow non-loopback binding only in hosted auth mode
- fail fast if hosted mode is configured with insecure or incomplete defaults

Localhost-only protections remain the last line of defence for local mode, not
the security model for hosted mode.

## Acceptance Criteria

- allowed Google login works
- allowed GitHub login works
- non-allowed email is rejected with a clear failure
- hosted API rejects:
  - no token
  - invalid signature
  - wrong issuer
  - wrong audience
  - expired token
- browser-side mutations succeed through the proxy
- multipart import succeeds through the proxy
- local mode still works intentionally
- hosted mode does not depend on `local-dev` identity anywhere

## Verification

Minimum verification for this phase:

- targeted auth unit tests
- API auth verification tests
- local hosted-mode dry run
- end-to-end login plus one mutation flow
- logout/session invalidation check
- import-through-proxy test

Recommended explicit scenarios:

1. allowed login via Google
2. allowed login via GitHub
3. rejected login from a non-allowlisted email
4. create transaction after login
5. logout, then retry authenticated action and confirm failure
6. direct API request without token and with forged token both fail

## Risks To Watch

- Auth.js compatibility with the current Next.js version
- proxy mishandling multipart streaming
- subtle breakage from mixing browser and server API access assumptions
- forgotten direct `local-dev` owner references in hosted code paths
- accidental leakage of browser session cookies to the API

## Deliverables

- Auth.js integration in `apps/web`
- DB-backed auth tables in the shared schema
- browser proxy route
- hosted-mode JWT verification in `apps/api`
- updated owner-resolution path
- passing auth and proxy verification tests
