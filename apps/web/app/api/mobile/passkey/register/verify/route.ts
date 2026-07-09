import { isHostedAuthMode } from "@lib/auth-mode";
import { resolveMobileApiUser } from "@lib/mobile-api-auth";
import { verifyMobilePasskeyRegistration } from "@lib/passkey-mobile";
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

  // Rate limit before authentication so unauthenticated probes are throttled
  // too, matching the unauthenticated sign-in endpoints.
  const rateLimit = await rateLimitRequest(
    request,
    MOBILE_AUTH_RATE_LIMITS.passkeyRegisterVerify,
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

  const authResult = await resolveMobileApiUser(request);
  if (!authResult.ok) {
    return authResult.response;
  }

  let body: unknown = null;

  try {
    body = await request.json();
  } catch {
    body = null;
  }

  const response =
    body && typeof body === "object" && "response" in body
      ? (body as { response: unknown }).response
      : null;
  const challenge =
    body && typeof body === "object" && "challenge" in body
      ? (body as { challenge: unknown }).challenge
      : null;

  if (
    !response ||
    typeof response !== "object" ||
    typeof challenge !== "string" ||
    !challenge.trim()
  ) {
    return Response.json(
      { message: "A passkey response and challenge are required." },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }

  const result = await verifyMobilePasskeyRegistration({
    userId: authResult.user.userId,
    response: response as Parameters<
      typeof verifyMobilePasskeyRegistration
    >[0]["response"],
    challenge: challenge.trim(),
  });

  if (!result) {
    return Response.json(
      { message: "Passkey registration could not be verified." },
      { status: 401, headers: NO_STORE_HEADERS },
    );
  }

  return Response.json(result, { headers: NO_STORE_HEADERS });
}
