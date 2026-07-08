import type { DeleteUserAccountRequest } from "@finhance/shared/users";
import { getDirectApiUrl, mintApiAccessToken } from "@lib/api-auth";
import {
  resolveCrossOriginRejection,
  toUpstreamResponse,
} from "@lib/api-proxy";
import { isHostedAuthMode } from "@lib/auth-mode";
import { resolveMobileApiUser } from "@lib/mobile-api-auth";

export const runtime = "nodejs";

const NO_STORE_HEADERS = { "cache-control": "no-store" };

export async function GET(request: Request) {
  if (!isHostedAuthMode()) {
    return Response.json(
      { message: "Account settings are only available on hosted deployments." },
      { status: 404, headers: NO_STORE_HEADERS },
    );
  }

  const authResult = await resolveMobileApiUser(request);
  if (!authResult.ok) {
    return authResult.response;
  }

  return Response.json(
    { email: authResult.user.email },
    { headers: NO_STORE_HEADERS },
  );
}

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

  const authResult = await resolveMobileApiUser(request, {
    requireRecentAuth: true,
  });
  if (!authResult.ok) {
    return authResult.response;
  }

  let body: DeleteUserAccountRequest | null = null;

  try {
    body = (await request.json()) as DeleteUserAccountRequest;
  } catch {
    body = null;
  }

  if (!body?.email?.trim()) {
    return Response.json(
      { message: "Confirmation email is required." },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }

  const apiToken = await mintApiAccessToken({
    userId: authResult.user.userId,
    email: authResult.user.email,
  });
  const upstreamResponse = await fetch(getDirectApiUrl("/users/me"), {
    method: "DELETE",
    headers: {
      authorization: `Bearer ${apiToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ email: body.email }),
    cache: "no-store",
  });

  return toUpstreamResponse(upstreamResponse);
}
