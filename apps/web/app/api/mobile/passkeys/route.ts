import type { DeleteUserPasskeyRequest } from "@finhance/shared/users";
import { resolveCrossOriginRejection } from "@lib/api-proxy";
import { isHostedAuthMode } from "@lib/auth-mode";
import { resolveMobileApiUser } from "@lib/mobile-api-auth";
import { deletePasskeyForUser, listPasskeysForUser } from "@lib/passkeys";

export const runtime = "nodejs";

const NO_STORE_HEADERS = { "cache-control": "no-store" };

export async function GET(request: Request) {
  if (!isHostedAuthMode()) {
    return Response.json(
      { message: "Passkeys are only available on hosted deployments." },
      { status: 404, headers: NO_STORE_HEADERS },
    );
  }

  const authResult = await resolveMobileApiUser(request);
  if (!authResult.ok) {
    return authResult.response;
  }

  return Response.json(await listPasskeysForUser(authResult.user.userId), {
    headers: NO_STORE_HEADERS,
  });
}

export async function DELETE(request: Request) {
  if (!isHostedAuthMode()) {
    return Response.json(
      { message: "Passkeys are only available on hosted deployments." },
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

  let body: DeleteUserPasskeyRequest | null = null;

  try {
    body = (await request.json()) as DeleteUserPasskeyRequest;
  } catch {
    body = null;
  }

  const credentialId = body?.credentialId?.trim();

  if (!credentialId) {
    return Response.json(
      { message: "A passkey id is required." },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }

  await deletePasskeyForUser(authResult.user.userId, credentialId);

  return new Response(null, { status: 204, headers: NO_STORE_HEADERS });
}
