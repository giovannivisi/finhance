# Phase 2 — Private Deployment

## Objective

Deploy the secured app privately on hosted infrastructure so it can be used from
desktop and mobile browsers without relying on the local development machine.

At the end of this phase:

- the web app is deployed on Vercel
- the API is deployed on Render
- the database is on Neon
- hosted auth works end to end
- anonymous public API access is blocked

This phase starts only after phase 1 is complete and verified locally.

## Scope

In scope:

- Vercel setup
- Render setup
- Neon hosted configuration
- OAuth callback setup
- hosted environment variables
- production-safe cookie and origin configuration

Out of scope:

- major usability redesign
- PWA/native work
- external gate products like Cloudflare Access or Tailscale

## Hosting Decisions

### Web host

Use `Vercel Hobby` for the Next.js app.

Reason:

- it is the cleanest fit for the current web stack
- the plan does not rely on Vercel-specific auth as the security model

### API host

Use `Render Free` initially.

Reason:

- it is the strongest free-only recommendation among the considered options
- the app code can remain generic and portable

Constraints to accept explicitly:

- spin-down after inactivity
- cold starts
- not a long-term scaling answer

### Database

Use `Neon`.

Prefer pooled connections and treat backup/restore discipline as part of hosted
operations, even for a private rollout.

## Implementation

### 1. Configure hosted env surfaces

For web:

- Auth.js secret
- Google client ID/secret
- GitHub client ID/secret
- bootstrap allowed email
- database connection string
- internal API URL
- JWT private key
- JWT issuer/audience
- canonical app URL

For API:

- database connection string
- JWT public key
- hosted auth mode
- host bind settings
- trust proxy settings
- explicit hosted origin/CORS settings

Document these generically so moving away from Render later is operationally
easy.

### 2. Deploy the web app

Set up the Vercel project for `apps/web`.

Keep deployment assumptions explicit:

- correct monorepo root/build settings
- correct env variable injection
- correct Auth.js callback base URL

### 3. Deploy the API

Set up the Render service for `apps/api`.

Keep the API host portable:

- standard Node/Nest startup
- no platform-SDK dependency
- no Render-specific app logic

### 4. Configure OAuth providers

Register hosted callback URLs for:

- Google
- GitHub

Verify the hosted callback flow end to end before broader QA begins.

### 5. Lock down hosted runtime behavior

Ensure:

- secure cookies in production
- correct `SameSite` behavior
- no accidental public browser-to-API trust assumptions
- no secrets or tokens are logged
- health/status endpoint strategy is explicit

### 6. Hosted smoke verification

Before phase 2 is considered done, run hosted smoke checks covering:

- login
- dashboard load
- one mutation path per major domain
- logout
- direct anonymous API rejection

## Acceptance Criteria

- web app is live on Vercel
- API is live on Render
- Neon-backed data access works
- hosted login succeeds via both configured providers
- only the allowed email can enter
- direct anonymous API requests fail
- core hosted workflows function
- cold-start behavior is documented and accepted

## Verification

Minimum verification for this phase:

1. hosted login via Google
2. hosted login via GitHub
3. dashboard load after login
4. create transaction
5. create or edit account
6. edit budget
7. recurring action
8. import preview/apply
9. logout
10. direct unauthenticated `curl` to the API fails

## Risks To Watch

- Render cold starts affecting perceived reliability
- Neon wake-up latency on the first request after idle
- provider callback misconfiguration
- environment-variable mismatch between web and API
- incorrect production cookie behavior across hosted redirects

## Deliverables

- Vercel-hosted web app
- Render-hosted API
- provider callback configuration
- hosted env documentation
- successful hosted smoke-test pass
