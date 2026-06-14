import { auth, signIn } from "@lib/auth";
import { isHostedAuthMode } from "@lib/auth-mode";
import { areDevRedirectsAllowed, mintMobileSignInCode } from "@lib/mobile-auth";
import {
  buildMobileCodeRedirectLocation,
  isValidPkceChallenge,
  resolveMobileRedirectTarget,
} from "@lib/mobile-auth.core";
import { buildSignInRedirectUrl } from "@lib/proxy-auth";

export const runtime = "nodejs";

const NO_STORE_HEADERS = { "cache-control": "no-store" };
const MOBILE_AUTH_PROVIDERS = new Set(["google", "github"]);

function resolveMobileAuthProvider(provider: string | null): string | null {
  const normalisedProvider = provider?.trim().toLowerCase();
  return normalisedProvider && MOBILE_AUTH_PROVIDERS.has(normalisedProvider)
    ? normalisedProvider
    : null;
}

/**
 * Browser-based sign-in handoff for the mobile app.
 *
 * The app opens this URL in the system browser with a PKCE challenge. Once an
 * Auth.js session exists (the regular Google/GitHub flow), a short-lived
 * sign-in code bound to that challenge is returned to the app through a
 * strictly allowlisted deep-link redirect, carried in the URL fragment so it
 * never appears in request logs. The app then exchanges code + verifier for
 * the long-lived mobile token at /api/mobile/token, so the token itself never
 * travels through the browser.
 */
export async function GET(request: Request) {
  if (!isHostedAuthMode()) {
    return Response.json(
      { message: "Mobile sign-in is only available on hosted deployments." },
      { status: 404, headers: NO_STORE_HEADERS },
    );
  }

  const searchParams = new URL(request.url).searchParams;
  const redirectTarget = resolveMobileRedirectTarget(
    searchParams.get("redirect"),
    { allowDevRedirects: areDevRedirectsAllowed() },
  );

  if (!redirectTarget) {
    return Response.json(
      { message: "Invalid or missing redirect target." },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }

  const challenge = searchParams.get("challenge")?.trim().toLowerCase() ?? "";

  if (!isValidPkceChallenge(challenge)) {
    return Response.json(
      { message: "Invalid or missing PKCE challenge." },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }

  const session = await auth();
  const userId = session?.user?.id?.trim();

  if (!userId) {
    const provider = resolveMobileAuthProvider(searchParams.get("provider"));

    if (provider) {
      const callbackUrl = new URL(request.url);
      await signIn(provider, {
        redirectTo: `${callbackUrl.pathname}${callbackUrl.search}`,
      });
    }

    return Response.redirect(buildSignInRedirectUrl(request.url), 302);
  }

  const code = await mintMobileSignInCode({
    userId,
    email: session?.user?.email ?? null,
    challenge,
  });

  return new Response(null, {
    status: 302,
    headers: {
      ...NO_STORE_HEADERS,
      location: buildMobileCodeRedirectLocation(redirectTarget, code),
    },
  });
}
