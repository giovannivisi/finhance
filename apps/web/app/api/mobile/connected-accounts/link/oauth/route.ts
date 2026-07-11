import { signIn } from "@lib/auth";
import { isHostedAuthMode } from "@lib/auth-mode";
import {
  MOBILE_PROVIDER_LINK_AUTH_CALLBACK_TARGET,
  readMobileProviderLinkStateFromRequest,
} from "@lib/mobile-provider-link";

export const runtime = "nodejs";

const NO_STORE_HEADERS = { "cache-control": "no-store" };

/**
 * Creates the regular Auth.js OAuth state and PKCE cookies. The provider's
 * registered callback remains `/api/auth/callback/{provider}`; our auth
 * callback later recognises the deferred mobile-link cookie and does not
 * persist anything until the native confirmation request arrives.
 */
export async function GET(request: Request) {
  if (!isHostedAuthMode()) {
    return Response.json(
      { message: "Connected providers are only available on hosted deployments." },
      { status: 404, headers: NO_STORE_HEADERS },
    );
  }

  const state = await readMobileProviderLinkStateFromRequest(request);

  if (!state) {
    return Response.json(
      { message: "The provider-link request is invalid or has expired." },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }

  await signIn(state.provider, {
    // This marker is stored by Auth.js in its callback-url cookie. The
    // callback verifies it before accepting the separate handoff cookie, so
    // an abandoned link cannot hijack a later normal browser sign-in.
    redirectTo: MOBILE_PROVIDER_LINK_AUTH_CALLBACK_TARGET,
  });

  // Auth.js normally throws Next.js' redirect response above after it has set
  // its OAuth state and PKCE cookies. Keep a safe fallback for an unexpected
  // non-redirecting provider implementation.
  return Response.json(
    { message: "Provider sign-in could not be started." },
    { status: 500, headers: NO_STORE_HEADERS },
  );
}
