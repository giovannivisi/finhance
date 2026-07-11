import type {
  ConfirmMobileProviderLinkRequest,
  ConfirmMobileProviderLinkResponse,
} from "@finhance/shared/users";
import { resolveCrossOriginRejection } from "@lib/api-proxy";
import { isHostedAuthMode } from "@lib/auth-mode";
import {
  ConnectedAccountAlreadyLinkedError,
  ConnectedAccountNotFoundError,
  linkConnectedAccountForUser,
} from "@lib/connected-accounts";
import { resolveMobileApiUser } from "@lib/mobile-api-auth";
import { verifyPkceVerifier } from "@lib/mobile-auth.core";
import {
  MOBILE_PROVIDER_LINK_RESULT_SCOPE,
  MOBILE_PROVIDER_LINK_TTL_MS,
  verifyMobileProviderLinkResult,
} from "@lib/mobile-provider-link";
import {
  MOBILE_AUTH_RATE_LIMITS,
  consumeOneShotKey,
  rateLimitRequest,
} from "@lib/request-rate-limit";

export const runtime = "nodejs";

const NO_STORE_HEADERS = { "cache-control": "no-store" };
const RATE_LIMIT_MESSAGE =
  "Too many provider-link attempts. Try again soon.";
const INVALID_RESULT_MESSAGE = "The provider-link result is invalid or has expired.";

/**
 * This is the only route that writes a provider account for a mobile handoff.
 * It requires a recent mobile bearer session and the PKCE verifier that never
 * travelled through the system browser.
 */
export async function POST(request: Request) {
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
    MOBILE_AUTH_RATE_LIMITS.providerLinkConfirm,
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

  let body: ConfirmMobileProviderLinkRequest | null = null;

  try {
    body = (await request.json()) as ConfirmMobileProviderLinkRequest;
  } catch {
    body = null;
  }

  const code = body?.code?.trim();
  const verifier = body?.verifier?.trim();

  if (!code || !verifier || code.length > 8_192) {
    return Response.json(
      { message: INVALID_RESULT_MESSAGE },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }

  const result = await verifyMobileProviderLinkResult(code);

  if (
    !result ||
    result.userId !== authResult.user.userId ||
    !result.providerEmail ||
    !result.providerEmailVerified ||
    !(await verifyPkceVerifier(verifier, result.challenge))
  ) {
    return Response.json(
      { message: INVALID_RESULT_MESSAGE },
      { status: 401, headers: NO_STORE_HEADERS },
    );
  }

  const consumed = await consumeOneShotKey(
    MOBILE_PROVIDER_LINK_RESULT_SCOPE,
    result.jti,
    MOBILE_PROVIDER_LINK_TTL_MS,
  );

  if (!consumed) {
    return Response.json(
      { message: INVALID_RESULT_MESSAGE },
      { status: 401, headers: NO_STORE_HEADERS },
    );
  }

  try {
    const connectedAccount = await linkConnectedAccountForUser({
      userId: authResult.user.userId,
      provider: result.provider,
      providerAccountId: result.accountId,
      metadata: {
        providerEmail: result.providerEmail,
        providerEmailVerified: result.providerEmailVerified,
        providerDisplayName: result.providerDisplayName,
      },
    });
    const response: ConfirmMobileProviderLinkResponse = { connectedAccount };

    return Response.json(response, { headers: NO_STORE_HEADERS });
  } catch (error) {
    if (error instanceof ConnectedAccountAlreadyLinkedError) {
      return Response.json(
        { message: error.message },
        { status: 409, headers: NO_STORE_HEADERS },
      );
    }

    if (error instanceof ConnectedAccountNotFoundError) {
      return Response.json(
        { message: INVALID_RESULT_MESSAGE },
        { status: 401, headers: NO_STORE_HEADERS },
      );
    }

    throw error;
  }
}
