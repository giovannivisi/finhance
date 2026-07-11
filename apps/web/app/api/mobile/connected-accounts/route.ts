import type { DeleteConnectedAccountRequest } from "@finhance/shared/users";
import { resolveCrossOriginRejection } from "@lib/api-proxy";
import { isHostedAuthMode } from "@lib/auth-mode";
import {
  ConnectedAccountNotFoundError,
  LastSignInMethodError,
  deleteConnectedAccountForUser,
} from "@lib/connected-accounts";
import { resolveMobileApiUser } from "@lib/mobile-api-auth";
import {
  MOBILE_AUTH_RATE_LIMITS,
  rateLimitRequest,
} from "@lib/request-rate-limit";

export const runtime = "nodejs";

const NO_STORE_HEADERS = { "cache-control": "no-store" };
const RATE_LIMIT_MESSAGE = "Too many provider changes. Try again soon.";

/**
 * Removes a provider linked to the current mobile user. The same recent-auth
 * and last-sign-in-method safeguards as web settings apply here too.
 */
export async function DELETE(request: Request) {
  if (!isHostedAuthMode()) {
    return Response.json(
      { message: "Connected providers are only available on hosted deployments." },
      { status: 404, headers: NO_STORE_HEADERS },
    );
  }

  const crossOriginRejection = resolveCrossOriginRejection(request);
  if (crossOriginRejection) {
    return crossOriginRejection;
  }

  const rateLimit = await rateLimitRequest(
    request,
    MOBILE_AUTH_RATE_LIMITS.providerLinkDelete,
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

  const authResult = await resolveMobileApiUser(request, {
    requireRecentAuth: true,
  });
  if (!authResult.ok) {
    return authResult.response;
  }

  let body: DeleteConnectedAccountRequest | null = null;

  try {
    body = (await request.json()) as DeleteConnectedAccountRequest;
  } catch {
    body = null;
  }

  const accountId = body?.accountId?.trim();

  if (!accountId) {
    return Response.json(
      { message: "A connected account id is required." },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }

  try {
    await deleteConnectedAccountForUser({
      userId: authResult.user.userId,
      accountId,
    });
  } catch (error) {
    if (error instanceof ConnectedAccountNotFoundError) {
      return Response.json(
        { message: error.message },
        { status: 404, headers: NO_STORE_HEADERS },
      );
    }

    if (error instanceof LastSignInMethodError) {
      return Response.json(
        { message: error.message },
        { status: 409, headers: NO_STORE_HEADERS },
      );
    }

    throw error;
  }

  return new Response(null, { status: 204, headers: NO_STORE_HEADERS });
}
