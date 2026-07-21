import { resolveCrossOriginRejection } from "@lib/api-proxy";
import { auth } from "@lib/auth";
import { isHostedAuthMode } from "@lib/auth-mode";
import {
  listMobileSessions,
  resolveMobileBearerUser,
  revokeAllMobileSessions,
} from "@lib/mobile-auth";

export const runtime = "nodejs";

const NO_STORE_HEADERS = { "cache-control": "no-store" };

async function resolveSessionOwner(
  request: Request,
): Promise<{ userId: string; currentSessionId: string | null } | null> {
  const session = await auth();
  const userId = session?.user?.id?.trim() ?? null;

  if (userId) {
    return { userId, currentSessionId: null };
  }

  const mobileUser = await resolveMobileBearerUser(
    request.headers.get("authorization"),
  );

  if (mobileUser.present && !mobileUser.invalid) {
    return {
      userId: mobileUser.user.userId,
      currentSessionId: mobileUser.user.sessionId,
    };
  }

  return null;
}

function authenticationRequiredResponse(): Response {
  return Response.json(
    { message: "Authentication is required." },
    { status: 401, headers: NO_STORE_HEADERS },
  );
}

/** Lists active mobile sessions without exposing any credential material. */
export async function GET(request: Request) {
  if (!isHostedAuthMode()) {
    return Response.json(
      { message: "Mobile sessions only exist on hosted deployments." },
      { status: 404, headers: NO_STORE_HEADERS },
    );
  }

  const crossOriginRejection = resolveCrossOriginRejection(request);

  if (crossOriginRejection) {
    return crossOriginRejection;
  }

  const owner = await resolveSessionOwner(request);
  if (!owner) {
    return authenticationRequiredResponse();
  }

  return Response.json(
    await listMobileSessions(owner.userId, owner.currentSessionId),
    { headers: NO_STORE_HEADERS },
  );
}

/** Revokes every active mobile session for the signed-in user. */
export async function DELETE(request: Request) {
  if (!isHostedAuthMode()) {
    return Response.json(
      { message: "Mobile sessions only exist on hosted deployments." },
      { status: 404, headers: NO_STORE_HEADERS },
    );
  }

  const crossOriginRejection = resolveCrossOriginRejection(request);
  if (crossOriginRejection) {
    return crossOriginRejection;
  }

  const owner = await resolveSessionOwner(request);
  if (!owner) {
    return authenticationRequiredResponse();
  }

  await revokeAllMobileSessions(owner.userId);

  return new Response(null, { status: 204, headers: NO_STORE_HEADERS });
}
