import { isHostedAuthMode } from "@lib/auth-mode";
import {
  createMobileProviderLinkCookie,
  MOBILE_PROVIDER_LINK_START_SCOPE,
  MOBILE_PROVIDER_LINK_TTL_MS,
  verifyMobileProviderLinkStart,
} from "@lib/mobile-provider-link";
import {
  MOBILE_AUTH_RATE_LIMITS,
  rateLimitRequest,
  consumeOneShotKey,
} from "@lib/request-rate-limit";

export const runtime = "nodejs";

const NO_STORE_HEADERS = { "cache-control": "no-store" };
const RATE_LIMIT_MESSAGE =
  "Too many provider-link attempts. Try again soon.";

/**
 * Runs in the system browser after the native app has authenticated the
 * request. It turns the opaque start state into a short-lived HttpOnly cookie
 * before redirecting to the Auth.js OAuth initiation endpoint.
 */
export async function GET(request: Request) {
  if (!isHostedAuthMode()) {
    return Response.json(
      { message: "Connected providers are only available on hosted deployments." },
      { status: 404, headers: NO_STORE_HEADERS },
    );
  }

  const rateLimit = await rateLimitRequest(
    request,
    MOBILE_AUTH_RATE_LIMITS.providerLinkAuthorize,
  );

  if (!rateLimit.allowed) {
    return Response.json(
      { message: RATE_LIMIT_MESSAGE },
      {
        status: 429,
        headers: { ...NO_STORE_HEADERS, ...rateLimit.headers },
      },
    );
  }

  const state = new URL(request.url).searchParams.get("state")?.trim();

  if (!state || state.length > 8_192) {
    return Response.json(
      { message: "The provider-link request is invalid or has expired." },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }

  const claims = await verifyMobileProviderLinkStart(state);

  if (!claims) {
    return Response.json(
      { message: "The provider-link request is invalid or has expired." },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }

  const consumed = await consumeOneShotKey(
    MOBILE_PROVIDER_LINK_START_SCOPE,
    claims.jti,
    MOBILE_PROVIDER_LINK_TTL_MS,
  );

  if (!consumed) {
    return Response.json(
      { message: "The provider-link request is invalid or has expired." },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }

  const oauthUrl = new URL(
    "/api/mobile/connected-accounts/link/oauth",
    request.url,
  );

  return new Response(null, {
    status: 302,
    headers: {
      ...NO_STORE_HEADERS,
      location: oauthUrl.toString(),
      "set-cookie": createMobileProviderLinkCookie(request, state),
    },
  });
}
