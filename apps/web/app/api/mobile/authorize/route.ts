import { auth } from "@lib/auth";
import { isHostedAuthMode } from "@lib/auth-mode";
import { areDevRedirectsAllowed, mintMobileToken } from "@lib/mobile-auth";
import {
  buildMobileTokenRedirectLocation,
  resolveMobileRedirectTarget,
} from "@lib/mobile-auth.core";
import { buildSignInRedirectUrl } from "@lib/proxy-auth";

export const runtime = "nodejs";

const NO_STORE_HEADERS = { "cache-control": "no-store" };

/**
 * Browser-based sign-in handoff for the mobile app.
 *
 * The app opens this URL in the system browser. Once an Auth.js session
 * exists (the regular Google/GitHub flow), a long-lived mobile token is
 * minted and returned to the app through a strictly allowlisted deep-link
 * redirect, carried in the URL fragment so it never appears in request logs.
 */
export async function GET(request: Request) {
  if (!isHostedAuthMode()) {
    return Response.json(
      { message: "Mobile sign-in is only available on hosted deployments." },
      { status: 404, headers: NO_STORE_HEADERS },
    );
  }

  const redirectTarget = resolveMobileRedirectTarget(
    new URL(request.url).searchParams.get("redirect"),
    { allowDevRedirects: areDevRedirectsAllowed() },
  );

  if (!redirectTarget) {
    return Response.json(
      { message: "Invalid or missing redirect target." },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }

  const session = await auth();
  const userId = session?.user?.id?.trim();

  if (!userId) {
    return Response.redirect(buildSignInRedirectUrl(request.url), 302);
  }

  const token = await mintMobileToken({
    userId,
    email: session?.user?.email ?? null,
  });

  return new Response(null, {
    status: 302,
    headers: {
      ...NO_STORE_HEADERS,
      location: buildMobileTokenRedirectLocation(redirectTarget, token),
    },
  });
}
