import type {
  StartMobileProviderLinkRequest,
  StartMobileProviderLinkResponse,
} from "@finhance/shared/users";
import { resolveCrossOriginRejection } from "@lib/api-proxy";
import { isHostedAuthMode } from "@lib/auth-mode";
import { isConnectedAccountProvider } from "@lib/connected-accounts";
import { resolveMobileApiUser } from "@lib/mobile-api-auth";
import { areDevRedirectsAllowed } from "@lib/mobile-auth";
import { isValidPkceChallenge, resolveMobileRedirectTarget } from "@lib/mobile-auth.core";
import { mintMobileProviderLinkStart } from "@lib/mobile-provider-link";
import {
  MOBILE_AUTH_RATE_LIMITS,
  rateLimitRequest,
} from "@lib/request-rate-limit";

export const runtime = "nodejs";

const NO_STORE_HEADERS = { "cache-control": "no-store" };
const RATE_LIMIT_MESSAGE =
  "Too many provider-link attempts. Try again soon.";

/**
 * Begins a provider-link handoff without putting the mobile bearer token in
 * the browser. The returned URL carries only an opaque, short-lived state
 * that is bound to the app's PKCE challenge.
 */
export async function POST(request: Request) {
  if (!isHostedAuthMode()) {
    return Response.json(
      { message: "Connected providers are only available on hosted deployments." },
      { status: 404, headers: NO_STORE_HEADERS },
    );
  }

  const crossOriginRejection = resolveCrossOriginRejection(request);
  if (crossOriginRejection) {
    return crossOriginRejection;
  }

  const rateLimit = await rateLimitRequest(
    request,
    MOBILE_AUTH_RATE_LIMITS.providerLinkStart,
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

  const authResult = await resolveMobileApiUser(request, {
    requireRecentAuth: true,
  });
  if (!authResult.ok) {
    return authResult.response;
  }

  let body: StartMobileProviderLinkRequest | null = null;

  try {
    body = (await request.json()) as StartMobileProviderLinkRequest;
  } catch {
    body = null;
  }

  const provider = body?.provider;
  const challenge = body?.challenge?.trim().toLowerCase() ?? "";
  const redirect = resolveMobileRedirectTarget(body?.redirect, {
    allowDevRedirects: areDevRedirectsAllowed(),
  });

  if (!isConnectedAccountProvider(provider)) {
    return Response.json(
      { message: "A supported provider is required." },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }

  if (!isValidPkceChallenge(challenge)) {
    return Response.json(
      { message: "Invalid or missing PKCE challenge." },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }

  if (!redirect) {
    return Response.json(
      { message: "Invalid or missing redirect target." },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }

  const state = await mintMobileProviderLinkStart({
    userId: authResult.user.userId,
    provider,
    challenge,
    redirect,
  });
  const authorizationUrl = new URL(
    "/api/mobile/connected-accounts/link/authorize",
    request.url,
  );
  authorizationUrl.searchParams.set("state", state);

  const response: StartMobileProviderLinkResponse = {
    authorizationUrl: authorizationUrl.toString(),
  };

  return Response.json(response, { headers: NO_STORE_HEADERS });
}
