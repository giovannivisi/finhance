export const runtime = "nodejs";

// The Apple Team ID is not a secret (it is public in every app's AASA and on
// the App Store), so it is safe to default here and override per deployment.
const DEFAULT_APPLE_TEAM_ID = "9Z8PCF6BP4";
const DEFAULT_IOS_BUNDLE_ID = "app.finhance.mobile";

/**
 * Serves the Apple App Site Association file (rewritten from
 * /.well-known/apple-app-site-association in next.config). The `webcredentials`
 * entry is what lets the native app assert the passkeys registered on this web
 * domain. The published app identifier is `<TeamID>.<bundleId>`; both can be
 * overridden via APPLE_TEAM_ID / IOS_BUNDLE_ID but default to this project's
 * values so the file serves correctly without extra configuration.
 */
export function GET() {
  const teamId = process.env.APPLE_TEAM_ID?.trim() || DEFAULT_APPLE_TEAM_ID;
  const bundleId = process.env.IOS_BUNDLE_ID?.trim() || DEFAULT_IOS_BUNDLE_ID;

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
