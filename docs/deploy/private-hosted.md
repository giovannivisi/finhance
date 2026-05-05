# Private Hosted Deployment

This guide is the repository-side playbook for the Phase 2 rollout:

- web on Vercel
- API on Render
- data on Neon
- app-level auth enabled from day 1

It assumes the auth foundation from Phase 1 is already working locally.

## Hosting shape

- `apps/web` deploys as a Vercel project
- `apps/api` deploys as a Render web service
- `packages/db` remains the single Prisma owner
- Neon remains the database

The browser talks to the Next.js app, and the web app proxies authenticated API
requests to the Nest API. The API should not assume direct browser trust.

## Requirements

- Node.js `20.9+`
- a Neon database URL for the hosted environment
- one Google OAuth web app
- one GitHub OAuth app
- one bootstrap email that is allowed to enter first
- one ES256 keypair shared between web and API

## 1. Generate secrets and keys

Generate the Auth.js session secret:

```bash
openssl rand -base64 32
```

Generate an ES256 keypair:

```bash
openssl ecparam -name prime256v1 -genkey -noout -out /tmp/finhance-auth-es256-private.pem
openssl pkcs8 -topk8 -nocrypt -in /tmp/finhance-auth-es256-private.pem -out /tmp/finhance-auth-es256-private.pkcs8.pem
openssl ec -in /tmp/finhance-auth-es256-private.pem -pubout -out /tmp/finhance-auth-es256-public.pem
```

Use:

- `AUTH_API_JWT_PRIVATE_KEY` on the web side
- `AUTH_API_JWT_PUBLIC_KEY` on the API side

## 2. Configure Neon

Use a dedicated hosted database or branch. Prefer Neon pooled connection URLs
for both web and API.

Before the first hosted deploy, and every time Prisma migrations change, run:

```bash
pnpm db:migrate:deploy
```

Render free services do not support a free pre-deploy command, so migration
execution must stay explicit.

## 3. Configure the web app on Vercel

Create one Vercel project from this monorepo and set:

- Root Directory: `apps/web`
- Framework preset: `Next.js`

Required hosted env values:

```bash
AUTH_MODE=hosted
AUTH_URL=https://your-web-app.vercel.app
NEXT_PUBLIC_API_URL=https://your-api.onrender.com
DATABASE_URL=postgresql://USER:PASSWORD@HOST/DB?sslmode=require

AUTH_SECRET=GENERATED_RANDOM_SECRET
AUTH_BOOTSTRAP_EMAIL=you@example.com

AUTH_GOOGLE_ID=google-client-id
AUTH_GOOGLE_SECRET=google-client-secret
AUTH_GITHUB_ID=github-client-id
AUTH_GITHUB_SECRET=github-client-secret

AUTH_API_JWT_ISSUER=https://your-web-app.vercel.app
AUTH_API_JWT_AUDIENCE=finhance-api
AUTH_API_JWT_KID=prod-key-1
AUTH_API_JWT_PRIVATE_KEY="<single-line PKCS#8 PEM private key value>"
```

Notes:

- `AUTH_SECRET` must be random. Hosted mode must never rely on the local dev
  fallback.
- `AUTH_BOOTSTRAP_EMAIL` must exactly match the verified provider email that is
  allowed to enter first.
- `AUTH_URL` should match the public Vercel URL you intend to use for OAuth
  callbacks.

## 4. Configure the API on Render

This repository includes a Render Blueprint in
[render.yaml](/Users/giovannivisi/Code/finhance/render.yaml).

The service expects:

- plan: `free`
- runtime: `node`
- public bind host: `0.0.0.0`
- trust proxy enabled
- health check path: `/health`

Required hosted env values:

```bash
NODE_ENV=production
AUTH_MODE=hosted
API_HOST=0.0.0.0
API_TRUST_PROXY=true
API_ALLOWED_ORIGINS=https://your-web-app.vercel.app
DATABASE_URL=postgresql://USER:PASSWORD@HOST/DB?sslmode=require

AUTH_API_JWT_ISSUER=https://your-web-app.vercel.app
AUTH_API_JWT_AUDIENCE=finhance-api
AUTH_API_JWT_KID=prod-key-1
AUTH_API_JWT_PUBLIC_KEY="<single-line PEM public key value>"
```

Notes:

- `API_ALLOWED_ORIGINS` must be explicit in hosted mode.
- `API_TRUST_PROXY` is required in hosted mode so request IP resolution and
  throttling behave correctly behind Render's load balancer.
- The API stays internet-reachable, but anonymous access to domain routes
  should still fail.
- Store the PEM contents as a single escaped env var value, not as a file path.

## 5. Configure OAuth callbacks

### Google

- Authorized origin: `https://your-web-app.vercel.app`
- Redirect URI:
  `https://your-web-app.vercel.app/api/auth/callback/google`

### GitHub

- Homepage URL: `https://your-web-app.vercel.app`
- Authorization callback URL:
  `https://your-web-app.vercel.app/api/auth/callback/github`

## 6. Smoke checks after deploy

Run these checks against the hosted environment:

1. login with Google
2. login with GitHub
3. verify only the bootstrap email can enter
4. open the dashboard
5. create a transaction
6. edit or create an account
7. edit a budget
8. run one recurring action
9. preview and apply one import batch
10. log out
11. `curl https://your-api.onrender.com/health`
12. `curl https://your-api.onrender.com/dashboard` and confirm it fails without
    auth

## 7. Hosted operations notes

- Render free services spin down after inactivity. The first request after idle
  will be slower.
- Neon can also be cold on the first request after idle.
- Rotate OAuth secrets if they were ever pasted into logs, screenshots, or chat
  history.
- Keep provider accounts protected with MFA/2FA.
