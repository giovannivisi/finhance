import { resolveAuthMode } from "@lib/auth-mode";

export const runtime = "nodejs";

/**
 * Public discovery endpoint for the mobile app: confirms this deployment is a
 * finhance web app and reports its auth mode so the app can pick the right
 * connect flow. Exposes nothing that is not already observable.
 */
export async function GET() {
  return Response.json(
    {
      status: "ok",
      service: "finhance-web",
      authMode: resolveAuthMode(),
      timestamp: new Date().toISOString(),
    },
    { headers: { "cache-control": "no-store" } },
  );
}
