import { resolveCrossOriginRejection } from "@lib/api-proxy";
import { auth } from "@lib/auth";
import { isHostedAuthMode } from "@lib/auth-mode";
import { resolveMobileBearerUser, revokeMobileSession } from "@lib/mobile-auth";

export const runtime = "nodejs";

const NO_STORE_HEADERS = { "cache-control": "no-store" };

type RouteContext = {
  params: Promise<{ sessionId: string }> | { sessionId: string };
};

function isValidSessionId(value: string): boolean {
  return /^[a-zA-Z0-9_-]{8,128}$/.test(value);
}

async function resolveOwner(request: Request): Promise<string | null> {
  const session = await auth();
  const sessionUserId = session?.user?.id?.trim();
  if (sessionUserId) {
    return sessionUserId;
  }

  const mobileUser = await resolveMobileBearerUser(
    request.headers.get("authorization"),
  );
  return mobileUser.present && !mobileUser.invalid
    ? mobileUser.user.userId
    : null;
}

/** Revokes one of the caller's devices; ids belonging to other users are hidden. */
export async function DELETE(request: Request, context: RouteContext) {
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

  const ownerId = await resolveOwner(request);
  if (!ownerId) {
    return Response.json(
      { message: "Authentication is required." },
      { status: 401, headers: NO_STORE_HEADERS },
    );
  }

  const { sessionId } = await context.params;
  if (!isValidSessionId(sessionId)) {
    return Response.json(
      { message: "Mobile session not found." },
      { status: 404, headers: NO_STORE_HEADERS },
    );
  }

  const revoked = await revokeMobileSession(ownerId, sessionId);
  if (!revoked) {
    return Response.json(
      { message: "Mobile session not found." },
      { status: 404, headers: NO_STORE_HEADERS },
    );
  }

  return new Response(null, { status: 204, headers: NO_STORE_HEADERS });
}
