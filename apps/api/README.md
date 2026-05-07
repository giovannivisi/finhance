# API

This app is the NestJS backend for Finhance.

It owns:

- finance-domain business logic
- Prisma-backed persistence through `@finhance/db`
- request-safety controls such as throttling, idempotency, and operation locks
- hosted API authorization checks

## Runtime contract

- local dev port: `3000`
- expected local host bind: `127.0.0.1`
- expected hosted bind: `0.0.0.0`

The API is intentionally split between two modes:

- `AUTH_MODE=local`
  - localhost-only trust model
  - loopback-only guards enforced
- `AUTH_MODE=hosted`
  - real JWT-backed authentication required
  - explicit host, origin, and trust-proxy settings required

## Local development

Typical local API loop:

```bash
pnpm db:generate
pnpm --filter api dev
```

If Prisma schema changes are involved:

```bash
pnpm db:migrate:dev
```

Local example env lives in
[.env.example](/Users/giovannivisi/Code/finhance/apps/api/.env.example).

## Hosted deployment

Hosted deployment in this repo means:

- `apps/web` on Vercel
- `apps/api` on Render
- Neon as the database

Repository-side deployment guidance lives in:

- [docs/deploy/private-hosted.md](/Users/giovannivisi/Code/finhance/docs/deploy/private-hosted.md)
- [render.yaml](/Users/giovannivisi/Code/finhance/render.yaml)

Key hosted requirements:

- `AUTH_MODE=hosted`
- explicit `API_HOST`
- explicit `API_ALLOWED_ORIGINS`
- explicit `API_TRUST_PROXY` hop count
- ES256 public key configured on the API

## Health endpoint

The API exposes:

- `GET /health`

This route is intentionally public so hosted platforms can perform health
checks. Domain routes remain protected in hosted mode.

## Production migration routine

Before the first hosted deploy, and after any future Prisma migration change,
run:

```bash
pnpm db:migrate:deploy
```

This repo does not rely on a local Postgres container workflow. Use Neon-backed
URLs for both local and hosted environments.
