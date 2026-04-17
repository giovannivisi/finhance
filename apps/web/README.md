# Web App

This app is the Next.js frontend for Finhance. In local development it should
run on `http://localhost:3001`, while the Nest API runs on
`http://127.0.0.1:3000`.

## Local Setup

Set `NEXT_PUBLIC_API_URL` in `apps/web/.env.local` to one of:

```bash
NEXT_PUBLIC_API_URL=http://127.0.0.1:3000
# or
NEXT_PUBLIC_API_URL=http://localhost:3000
```

Start the full repo from the workspace root:

```bash
pnpm dev
```

Then open [http://localhost:3001](http://localhost:3001).

If you prefer to start services separately:

```bash
pnpm --filter api dev
pnpm --filter web dev
```

## Expected Ports

- Web: `3001`
- API: `3000`

The API CORS defaults already assume the web app runs on `3001`, so keeping the
frontend and backend on separate local ports avoids sending API requests to the
Next.js server by mistake.

## Troubleshooting

If the dashboard says it could not reach the API:

- confirm the API returns JSON at `http://127.0.0.1:3000/dashboard`
- confirm the web app is running at `http://localhost:3001`
- confirm `NEXT_PUBLIC_API_URL` is not pointing at the web server

If `NEXT_PUBLIC_API_URL` points at the web app, the frontend may receive an
HTML page instead of API JSON.

## Deploy

This README only documents the local development contract between the Next.js
frontend and the local Nest API.
