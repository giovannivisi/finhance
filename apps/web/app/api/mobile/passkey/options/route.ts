import { isHostedAuthMode } from "@lib/auth-mode";
import { createMobilePasskeyAuthentication } from "@lib/passkey-mobile";
import {
  MOBILE_AUTH_RATE_LIMITS,
  rateLimitRequest,
} from "@lib/request-rate-limit";

export const runtime = "nodejs";

const NO_STORE_HEADERS = { "cache-control": "no-store" };
const RATE_LIMIT_MESSAGE = "Too many mobile sign-in attempts. Try again soon.";

/**
 * Issues WebAuthn authentication options plus a short-lived signed challenge
 * for the mobile passkey ceremony. The app runs the native ceremony with the
 * options and posts the assertion (with the same challenge token) back to
 * /api/mobile/passkey/verify.
 */
export async function POST(request: Request) {
  if (!isHostedAuthMode()) {
    return Response.json(
      { message: "Mobile sign-in is only available on hosted deployments." },
      { status: 404, headers: NO_STORE_HEADERS },
    );
  }

  const rateLimit = await rateLimitRequest(
    request,
    MOBILE_AUTH_RATE_LIMITS.passkeyOptions,
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

  const { options, challenge } = await createMobilePasskeyAuthentication();

  return Response.json({ options, challenge }, { headers: NO_STORE_HEADERS });
}
