import { isHostedAuthMode } from "@lib/auth-mode";
import { resolveMobileApiUser } from "@lib/mobile-api-auth";
import { createMobilePasskeyRegistration } from "@lib/passkey-mobile";
import {
  MOBILE_AUTH_RATE_LIMITS,
  rateLimitRequest,
} from "@lib/request-rate-limit";

export const runtime = "nodejs";

const NO_STORE_HEADERS = { "cache-control": "no-store" };
const RATE_LIMIT_MESSAGE =
  "Too many passkey registration attempts. Try again soon.";

export async function POST(request: Request) {
  if (!isHostedAuthMode()) {
    return Response.json(
      { message: "Passkeys are only available on hosted deployments." },
      { status: 404, headers: NO_STORE_HEADERS },
    );
  }

  const authResult = await resolveMobileApiUser(request, {
    requireRecentAuth: true,
  });
  if (!authResult.ok) {
    return authResult.response;
  }

  const rateLimit = await rateLimitRequest(
    request,
    MOBILE_AUTH_RATE_LIMITS.passkeyRegisterOptions,
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

  const result = await createMobilePasskeyRegistration(authResult.user.userId);

  if (!result) {
    return Response.json(
      { message: "Authentication is required." },
      { status: 401, headers: NO_STORE_HEADERS },
    );
  }

  return Response.json(result, { headers: NO_STORE_HEADERS });
}
