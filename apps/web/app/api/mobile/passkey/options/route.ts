import { isHostedAuthMode } from "@lib/auth-mode";
import { createMobilePasskeyAuthentication } from "@lib/passkey-mobile";

export const runtime = "nodejs";

const NO_STORE_HEADERS = { "cache-control": "no-store" };

/**
 * Issues WebAuthn authentication options plus a short-lived signed challenge
 * for the mobile passkey ceremony. The app runs the native ceremony with the
 * options and posts the assertion (with the same challenge token) back to
 * /api/mobile/passkey/verify.
 */
export async function POST() {
  if (!isHostedAuthMode()) {
    return Response.json(
      { message: "Mobile sign-in is only available on hosted deployments." },
      { status: 404, headers: NO_STORE_HEADERS },
    );
  }

  const { options, challenge } = await createMobilePasskeyAuthentication();

  return Response.json({ options, challenge }, { headers: NO_STORE_HEADERS });
}
