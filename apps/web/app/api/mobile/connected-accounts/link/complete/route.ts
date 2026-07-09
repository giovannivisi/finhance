import { isHostedAuthMode } from "@lib/auth-mode";
import { areDevRedirectsAllowed } from "@lib/mobile-auth";
import {
  buildMobileCodeRedirectLocation,
  resolveMobileRedirectTarget,
} from "@lib/mobile-auth.core";
import { verifyMobileProviderLinkResult } from "@lib/mobile-provider-link";

export const runtime = "nodejs";

const NO_STORE_HEADERS = { "cache-control": "no-store" };

/**
 * Auth.js reaches this local URL only after the OAuth provider returned a
 * valid response. The result remains encrypted in transit and is placed in a
 * fragment for the app; it cannot link an account until `/link/confirm`
 * checks the mobile bearer token and PKCE verifier.
 */
export async function GET(request: Request) {
  if (!isHostedAuthMode()) {
    return Response.json(
      { message: "Connected providers are only available on hosted deployments." },
      { status: 404, headers: NO_STORE_HEADERS },
    );
  }

  const code = new URL(request.url).searchParams.get("code")?.trim();

  if (!code || code.length > 8_192) {
    return Response.json(
      { message: "The provider-link result is invalid or has expired." },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }

  const result = await verifyMobileProviderLinkResult(code);

  if (!result) {
    return Response.json(
      { message: "The provider-link result is invalid or has expired." },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }

  // Defence in depth: the redirect was validated before minting the start
  // state, but validate it again before redirecting out of the web origin.
  const redirect = resolveMobileRedirectTarget(result.redirect, {
    allowDevRedirects: areDevRedirectsAllowed(),
  });

  if (!redirect) {
    return Response.json(
      { message: "The provider-link result is invalid or has expired." },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }

  return new Response(null, {
    status: 302,
    headers: {
      ...NO_STORE_HEADERS,
      location: buildMobileCodeRedirectLocation(redirect, code),
    },
  });
}
