import { resolveCrossOriginRejection } from "@lib/api-proxy";
import { auth } from "@lib/auth";
import { isHostedAuthMode } from "@lib/auth-mode";
import { resolveMobileBearerUser } from "@lib/mobile-auth";
import { prisma } from "@lib/prisma";

export const runtime = "nodejs";

const NO_STORE_HEADERS = { "cache-control": "no-store" };

/**
 * Revokes every mobile session for the signed-in user: tokens issued before
 * this moment stop resolving, so lost or stale devices are signed out without
 * disabling the account.
 */
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

  const session = await auth();
  let userId = session?.user?.id?.trim() ?? null;

  if (!userId) {
    const mobileUser = await resolveMobileBearerUser(
      request.headers.get("authorization"),
    );

    if (mobileUser.present && !mobileUser.invalid) {
      userId = mobileUser.user.userId;
    }
  }

  if (!userId) {
    return Response.json(
      { message: "Authentication is required." },
      { status: 401, headers: NO_STORE_HEADERS },
    );
  }

  await prisma.user.update({
    where: { id: userId },
    data: { mobileTokensRevokedAt: new Date() },
  });

  return new Response(null, { status: 204, headers: NO_STORE_HEADERS });
}
