import type {
  DeleteUserPasskeyRequest,
  UserPasskeyResponse,
} from "@finhance/shared/users";
import { resolveCrossOriginRejection } from "@lib/api-proxy";
import { auth } from "@lib/auth";
import { isHostedAuthMode } from "@lib/auth-mode";
import { prisma } from "@lib/prisma";

export const runtime = "nodejs";

const NO_STORE_HEADERS = { "cache-control": "no-store" };

function toPasskeyResponse(input: {
  credentialID: string;
  credentialDeviceType: string;
  credentialBackedUp: boolean;
  transports: string | null;
  counter: number;
  createdAt: Date;
  updatedAt: Date;
}): UserPasskeyResponse {
  return {
    credentialId: input.credentialID,
    credentialDeviceType: input.credentialDeviceType,
    credentialBackedUp: input.credentialBackedUp,
    transports: input.transports,
    createdAt: input.createdAt.toISOString(),
    lastUsedAt: input.counter > 0 ? input.updatedAt.toISOString() : null,
  };
}

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

  const passkeys = await prisma.authAuthenticator.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
  });

  return Response.json(passkeys.map(toPasskeyResponse), {
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

  const userId = await resolveSessionUserId();

  if (!userId) {
    return Response.json(
      { message: "Authentication is required." },
      { status: 401, headers: NO_STORE_HEADERS },
    );
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

  await prisma.authAuthenticator.deleteMany({
    where: {
      userId,
      credentialID: credentialId,
    },
  });

  return new Response(null, { status: 204, headers: NO_STORE_HEADERS });
}
