import { isHostedAuthMode } from "@lib/auth-mode";
import { refreshMobileSession } from "@lib/mobile-auth";
import {
  MOBILE_AUTH_RATE_LIMITS,
  rateLimitRequest,
} from "@lib/request-rate-limit";

export const runtime = "nodejs";

const NO_STORE_HEADERS = { "cache-control": "no-store" };
const RATE_LIMIT_MESSAGE = "Too many mobile refresh attempts. Try again soon.";

/**
 * Rotates the opaque, device-bound refresh token and returns a new short-lived
 * mobile bearer. Neither credential is ever placed in a browser redirect.
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
    MOBILE_AUTH_RATE_LIMITS.tokenRefresh,
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

  let body: unknown = null;

  try {
    body = await request.json();
  } catch {
    body = null;
  }

  const refreshToken =
    body && typeof body === "object" && "refreshToken" in body
      ? (body as { refreshToken: unknown }).refreshToken
      : null;

  if (typeof refreshToken !== "string" || !refreshToken.trim()) {
    return Response.json(
      { message: "A refresh token is required." },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }

  const session = await refreshMobileSession({ refreshToken });

  if (!session) {
    return Response.json(
      {
        message: "Mobile session is invalid or expired.",
        code: "MOBILE_SESSION_INVALID",
      },
      { status: 401, headers: NO_STORE_HEADERS },
    );
  }

  return Response.json(session, { headers: NO_STORE_HEADERS });
}
