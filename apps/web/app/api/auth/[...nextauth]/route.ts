import { auth, handlers } from "@lib/auth";
import {
  RECENT_AUTH_REQUIRED_MESSAGE,
  hasRecentSessionAuthentication,
} from "@lib/recent-auth";

export const runtime = "nodejs";
export const preferredRegion = "fra1";

const NO_STORE_HEADERS = { "cache-control": "no-store" };
type AuthGetRequest = Parameters<typeof handlers.GET>[0];

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

  return handlers.GET(request as AuthGetRequest);
}

export const { POST } = handlers;
