import type { DeleteConnectedAccountRequest } from "@finhance/shared/users";
import { resolveCrossOriginRejection } from "@lib/api-proxy";
import { auth } from "@lib/auth";
import { isHostedAuthMode } from "@lib/auth-mode";
import {
  ConnectedAccountNotFoundError,
  LastSignInMethodError,
  deleteConnectedAccountForUser,
  isConnectedAccountProvider,
  listConnectedAccountsForUser,
} from "@lib/connected-accounts";
import {
  RECENT_AUTH_REQUIRED_MESSAGE,
  hasRecentSessionAuthentication,
} from "@lib/recent-auth";
import { mintWebProviderLinkIntent } from "@lib/web-provider-link";

export const runtime = "nodejs";

const NO_STORE_HEADERS = { "cache-control": "no-store" };

async function resolveSessionUserId(): Promise<string | null> {
  const session = await auth();
  return session?.user?.id?.trim() || null;
}

export async function GET() {
  if (!isHostedAuthMode()) {
    return Response.json([], { headers: NO_STORE_HEADERS });
  }

  const userId = await resolveSessionUserId();

  if (!userId) {
    return Response.json(
      { message: "Authentication is required." },
      { status: 401, headers: NO_STORE_HEADERS },
    );
  }

  return Response.json(await listConnectedAccountsForUser(userId), {
    headers: NO_STORE_HEADERS,
  });
}

export async function POST(request: Request) {
  if (!isHostedAuthMode()) {
    return Response.json(
      {
        message: "Connected accounts are only available on hosted deployments.",
      },
      { status: 404, headers: NO_STORE_HEADERS },
    );
  }

  const crossOriginRejection = resolveCrossOriginRejection(request);
  if (crossOriginRejection) {
    return crossOriginRejection;
  }

  const userId = await resolveSessionUserId();
  if (!userId) {
    return Response.json(
      { message: "Authentication is required." },
      { status: 401, headers: NO_STORE_HEADERS },
    );
  }

  if (!(await hasRecentSessionAuthentication(userId))) {
    return Response.json(
      { message: RECENT_AUTH_REQUIRED_MESSAGE },
      { status: 403, headers: NO_STORE_HEADERS },
    );
  }

  let body: { provider?: unknown } | null = null;
  try {
    body = (await request.json()) as { provider?: unknown };
  } catch {
    body = null;
  }

  const providerCandidate =
    typeof body?.provider === "string" ? body.provider : undefined;

  if (!isConnectedAccountProvider(providerCandidate)) {
    return Response.json(
      { message: "A supported provider is required." },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }

  const provider = providerCandidate;
  const intentCookie = await mintWebProviderLinkIntent({
    request,
    userId,
    provider,
  });

  return new Response(null, {
    status: 204,
    headers: { ...NO_STORE_HEADERS, "set-cookie": intentCookie },
  });
}

export async function DELETE(request: Request) {
  if (!isHostedAuthMode()) {
    return Response.json(
      {
        message: "Connected accounts are only available on hosted deployments.",
      },
      { status: 404, headers: NO_STORE_HEADERS },
    );
  }

  const crossOriginRejection = resolveCrossOriginRejection(request);

  if (crossOriginRejection) {
    return crossOriginRejection;
  }

  const userId = await resolveSessionUserId();

  if (!userId) {
    return Response.json(
      { message: "Authentication is required." },
      { status: 401, headers: NO_STORE_HEADERS },
    );
  }

  if (!(await hasRecentSessionAuthentication(userId))) {
    return Response.json(
      { message: RECENT_AUTH_REQUIRED_MESSAGE },
      { status: 403, headers: NO_STORE_HEADERS },
    );
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
    await deleteConnectedAccountForUser({ userId, accountId });
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
