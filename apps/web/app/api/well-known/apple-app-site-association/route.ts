export const runtime = "nodejs";

/**
 * Serves the Apple App Site Association file (rewritten from
 * /.well-known/apple-app-site-association in next.config). The `webcredentials`
 * entry is what lets the native app assert the passkeys registered on this web
 * domain. The Apple app identifier is `<TeamID>.<bundleId>`; both come from env
 * so the team id is configured per deployment rather than committed.
 *
 * Returns 404 until APPLE_TEAM_ID is set, so the route fails closed.
 */
export function GET() {
  const teamId = process.env.APPLE_TEAM_ID?.trim();
  const bundleId = process.env.IOS_BUNDLE_ID?.trim() || "app.finhance.mobile";

  if (!teamId) {
    return new Response("Not configured", {
      status: 404,
      headers: { "cache-control": "no-store" },
    });
  }

  const appId = `${teamId}.${bundleId}`;
  const body = {
    applinks: { apps: [], details: [] as unknown[] },
    webcredentials: { apps: [appId] },
  };

  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      "content-type": "application/json",
      "cache-control": "public, max-age=3600",
    },
  });
}
