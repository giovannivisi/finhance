import { isHostedAuthMode } from "@lib/auth-mode";
import { exchangeMobileSignInCode } from "@lib/mobile-auth";
import {
  MOBILE_AUTH_RATE_LIMITS,
  rateLimitRequest,
} from "@lib/request-rate-limit";

export const runtime = "nodejs";

const NO_STORE_HEADERS = { "cache-control": "no-store" };
const RATE_LIMIT_MESSAGE = "Too many mobile sign-in attempts. Try again soon.";

/**
 * Exchanges the sign-in code from the authorize handoff plus the app-held
 * PKCE verifier for a long-lived mobile session token. The app calls this
 * directly (no browser involved), so the token never appears in a redirect.
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
    MOBILE_AUTH_RATE_LIMITS.tokenExchange,
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

  const code =
    body && typeof body === "object" && "code" in body
      ? (body as { code: unknown }).code
      : null;
  const verifier =
    body && typeof body === "object" && "verifier" in body
      ? (body as { verifier: unknown }).verifier
      : null;

  if (
    typeof code !== "string" ||
    !code.trim() ||
    typeof verifier !== "string" ||
    !verifier.trim()
  ) {
    return Response.json(
      { message: "A sign-in code and verifier are required." },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }

  const token = await exchangeMobileSignInCode({
    code: code.trim(),
    verifier: verifier.trim(),
  });

  if (!token) {
    return Response.json(
      { message: "The sign-in code is invalid or has expired." },
      { status: 401, headers: NO_STORE_HEADERS },
    );
  }

  return Response.json({ token }, { headers: NO_STORE_HEADERS });
}
