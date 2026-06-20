import { isHostedAuthMode } from "@lib/auth-mode";
import { verifyMobilePasskeyAuthentication } from "@lib/passkey-mobile";

export const runtime = "nodejs";

const NO_STORE_HEADERS = { "cache-control": "no-store" };

/**
 * Verifies a mobile passkey assertion against the stored authenticator and, on
 * success, returns a mobile session token. The app calls this directly over
 * HTTPS (no browser), so the token never travels through a redirect.
 */
export async function POST(request: Request) {
  if (!isHostedAuthMode()) {
    return Response.json(
      { message: "Mobile sign-in is only available on hosted deployments." },
      { status: 404, headers: NO_STORE_HEADERS },
    );
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
      { message: "A passkey assertion and challenge are required." },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }

  const result = await verifyMobilePasskeyAuthentication({
    response: response as Parameters<
      typeof verifyMobilePasskeyAuthentication
    >[0]["response"],
    challenge: challenge.trim(),
  });

  if (!result) {
    return Response.json(
      { message: "Passkey sign-in could not be verified." },
      { status: 401, headers: NO_STORE_HEADERS },
    );
  }

  return Response.json({ token: result.token }, { headers: NO_STORE_HEADERS });
}
