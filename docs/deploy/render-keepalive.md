# Render keepalive

This repository includes a GitHub Actions workflow that pings the hosted API
every 10 minutes to reduce the chance of a free Render web service spinning
down.

## What it hits

Use the public API health route:

- `https://<your-render-host>/health`

For this project, `GET /health` is already public and intended for hosting
platform checks.

## Setup

1. In GitHub, open this repository's settings.
2. Go to `Settings -> Secrets and variables -> Actions -> Variables`.
3. Create a repository variable named `RENDER_KEEPALIVE_URL`.
4. Set its value to your hosted API health URL, for example:

```text
https://finhance-api.onrender.com/health
```

5. Ensure the workflow file exists on the default branch.
6. Wait for the next scheduled run, or trigger `Render keepalive` manually from
   the Actions tab.

## Important caveats

- GitHub Actions scheduled workflows run at best every 5 minutes. This workflow
  uses a 10-minute cadence.
- GitHub can delay scheduled workflows during busy periods, especially near the
  start of the hour. The schedule here is offset to reduce that risk.
- Scheduled workflows only run from the default branch.
- In public repositories, GitHub disables scheduled workflows after 60 days
  without repository activity.

If you need stricter uptime than this workaround can offer, use a paid Render
instance instead of a keepalive ping.
