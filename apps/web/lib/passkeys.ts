import type { UserPasskeyResponse } from "@finhance/shared/users";
import { prisma } from "./prisma";

const PASSKEY_PROVIDER = "passkey";

export function toPasskeyResponse(input: {
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

export async function listPasskeysForUser(
  userId: string,
): Promise<UserPasskeyResponse[]> {
  const passkeys = await prisma.authAuthenticator.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
  });

  return passkeys.map(toPasskeyResponse);
}

export async function deletePasskeyForUser(
  userId: string,
  credentialId: string,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.authAuthenticator.deleteMany({
      where: {
        userId,
        credentialID: credentialId,
      },
    });
    await tx.authProviderAccount.deleteMany({
      where: {
        userId,
        provider: PASSKEY_PROVIDER,
        providerAccountId: credentialId,
      },
    });
  });
}

export { PASSKEY_PROVIDER };
