import { auth, handlers } from "@lib/auth";
import {
  clearMobileProviderLinkCookie,
  MOBILE_PROVIDER_LINK_COOKIE,
} from "@lib/mobile-provider-link";
import {
  RECENT_AUTH_REQUIRED_MESSAGE,
  hasRecentSessionAuthentication,
} from "@lib/recent-auth";

export const runtime = "nodejs";
export const preferredRegion = "fra1";

const NO_STORE_HEADERS = { "cache-control": "no-store" };
type AuthGetRequest = Parameters<typeof handlers.GET>[0];

function isMobileProviderLinkCallback(request: Request): boolean {
  const path = new URL(request.url).pathname;
  return /^\/api\/auth\/callback\/(google|github)$/.test(path);
}

function hasMobileProviderLinkCookie(request: Request): boolean {
  return request.headers
    .get("cookie")
    ?.split(";")
    .some((entry) => entry.trim().startsWith(`${MOBILE_PROVIDER_LINK_COOKIE}=`)) ?? false;
}

function isPasskeyRegistrationOptionsRequest(request: Request): boolean {
  const url = new URL(request.url);
  return (
    url.pathname.endsWith("/api/auth/webauthn-options/passkey") &&
    url.searchParams.get("action") === "register"
  );
}

async function resolvePasskeyRegistrationRejection(
  request: Request,
): Promise<Response | null> {
  if (!isPasskeyRegistrationOptionsRequest(request)) {
    return null;
  }

  const session = await auth();
  const userId = session?.user?.id?.trim();

  if (!userId) {
    return Response.json(
      { message: "Authentication is required." },
      { status: 401, headers: NO_STORE_HEADERS },
    );
  }

  if (await hasRecentSessionAuthentication(userId)) {
    return null;
  }

  return Response.json(
    { message: RECENT_AUTH_REQUIRED_MESSAGE },
    { status: 403, headers: NO_STORE_HEADERS },
  );
}

export async function GET(request: Request) {
  const passkeyRegistrationRejection =
    await resolvePasskeyRegistrationRejection(request);
  if (passkeyRegistrationRejection) {
    return passkeyRegistrationRejection;
  }

  const response = await handlers.GET(request as AuthGetRequest);

  // A mobile provider-link callback only uses the HttpOnly state cookie to
  // route Auth.js into its deferred confirmation flow. Clear it on either a
  // success or provider-side failure so it cannot affect a later browser
  // sign-in attempt.
  if (
    isMobileProviderLinkCallback(request) &&
    hasMobileProviderLinkCookie(request)
  ) {
    response.headers.append("set-cookie", clearMobileProviderLinkCookie(request));
  }

  return response;
}

export const { POST } = handlers;
