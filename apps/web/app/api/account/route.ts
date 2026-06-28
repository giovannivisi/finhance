import {
  resolveCrossOriginRejection,
  toUpstreamResponse,
} from "@lib/api-proxy";
import { auth } from "@lib/auth";
import { isHostedAuthMode } from "@lib/auth-mode";
import {
  RECENT_AUTH_REQUIRED_MESSAGE,
  hasRecentSessionAuthentication,
} from "@lib/recent-auth";
import { fetchServerApi } from "@lib/server-api";

export const runtime = "nodejs";

const NO_STORE_HEADERS = { "cache-control": "no-store" };

export async function DELETE(request: Request) {
  if (!isHostedAuthMode()) {
    return Response.json(
      { message: "Account deletion is only available on hosted deployments." },
      { status: 404, headers: NO_STORE_HEADERS },
    );
  }

  const crossOriginRejection = resolveCrossOriginRejection(request);
  if (crossOriginRejection) {
    return crossOriginRejection;
  }

  const session = await auth();
  const userId = session?.user?.id?.trim();

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

  const headers = new Headers();
  for (const name of ["content-type", "idempotency-key"]) {
    const value = request.headers.get(name);
    if (value) {
      headers.set(name, value);
    }
  }

  const upstreamResponse = await fetchServerApi("/users/me", {
    method: "DELETE",
    headers,
    body: await request.text(),
  });

  return toUpstreamResponse(upstreamResponse);
}
