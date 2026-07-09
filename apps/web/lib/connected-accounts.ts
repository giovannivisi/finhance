import "server-only";

import type {
  ConnectedAccountProvider,
  ConnectedAccountResponse,
  UserIdentityResponse,
} from "@finhance/shared/users";
import { Prisma } from "@finhance/db";
import { prisma } from "./prisma";

const CONNECTED_ACCOUNT_PROVIDERS = ["google", "github"] as const;

const PROVIDER_LABELS: Record<ConnectedAccountProvider, string> = {
  google: "Google",
  github: "GitHub",
};

type LinkedProviderAccountRecord = {
  id: string;
  provider: string;
  providerEmail: string | null;
  providerEmailVerified: boolean | null;
  providerDisplayName: string | null;
  createdAt: Date | null;
};

type ProviderProfile = Record<string, unknown> | null | undefined;

export function isConnectedAccountProvider(
  provider: string | null | undefined,
): provider is ConnectedAccountProvider {
  return CONNECTED_ACCOUNT_PROVIDERS.includes(
    provider as ConnectedAccountProvider,
  );
}

export function getConnectedAccountProviderLabel(
  provider: ConnectedAccountProvider,
): string {
  return PROVIDER_LABELS[provider];
}

function normalizeEmail(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  return normalized || null;
}

function normalizeDisplayName(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  return normalized || null;
}

export function hasVerifiedLinkedProviderEmail(
  provider: string | undefined,
  profile: ProviderProfile,
): boolean {
  if (!provider || !profile) {
    return false;
  }

  if (provider === "google") {
    return profile.email_verified === true;
  }

  if (provider === "github") {
    return profile.email_verified === true;
  }

  return false;
}

function getProviderDisplayName(
  provider: string,
  profile: ProviderProfile,
): string | null {
  if (!profile) {
    return null;
  }

  if (provider === "github") {
    return (
      normalizeDisplayName(profile.login) ?? normalizeDisplayName(profile.name)
    );
  }

  return normalizeDisplayName(profile.name);
}

function toConnectedAccountResponse(
  account: LinkedProviderAccountRecord,
  primaryEmail: string | null,
): ConnectedAccountResponse | null {
  if (!isConnectedAccountProvider(account.provider)) {
    return null;
  }

  const providerEmail = normalizeEmail(account.providerEmail);

  return {
    id: account.id,
    provider: account.provider,
    providerLabel: getConnectedAccountProviderLabel(account.provider),
    providerEmail,
    providerEmailVerified: account.providerEmailVerified === true,
    providerDisplayName: account.providerDisplayName,
    createdAt: account.createdAt ? account.createdAt.toISOString() : null,
    isPrimaryEmail:
      providerEmail !== null &&
      primaryEmail !== null &&
      providerEmail === primaryEmail,
  };
}

export async function listConnectedAccountsForUser(
  userId: string,
): Promise<ConnectedAccountResponse[]> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      email: true,
      providerAccounts: {
        where: {
          provider: {
            in: [...CONNECTED_ACCOUNT_PROVIDERS],
          },
        },
        orderBy: [{ createdAt: "asc" }, { provider: "asc" }],
        select: {
          id: true,
          provider: true,
          providerEmail: true,
          providerEmailVerified: true,
          providerDisplayName: true,
          createdAt: true,
        },
      },
    },
  });

  if (!user) {
    return [];
  }

  const primaryEmail = normalizeEmail(user.email);

  return user.providerAccounts.flatMap((account) => {
    const response = toConnectedAccountResponse(account, primaryEmail);
    return response ? [response] : [];
  });
}

export async function getUserIdentityForUser(
  userId: string,
): Promise<UserIdentityResponse | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      email: true,
      name: true,
      image: true,
    },
  });

  if (!user) {
    return null;
  }

  return {
    email: user.email,
    name: user.name,
    image: user.image,
    connectedAccounts: await listConnectedAccountsForUser(userId),
  };
}

export async function captureLinkedProviderAccountMetadata(input: {
  provider: string | undefined;
  providerAccountId: string | undefined;
  profile: ProviderProfile;
}): Promise<void> {
  if (
    !isConnectedAccountProvider(input.provider) ||
    !input.providerAccountId?.trim()
  ) {
    return;
  }

  await prisma.authProviderAccount.updateMany({
    where: {
      provider: input.provider,
      providerAccountId: input.providerAccountId,
    },
    data: {
      providerEmail: normalizeEmail(input.profile?.email),
      providerEmailVerified: hasVerifiedLinkedProviderEmail(
        input.provider,
        input.profile,
      ),
      providerDisplayName: getProviderDisplayName(
        input.provider,
        input.profile,
      ),
    },
  });
}

export class ConnectedAccountNotFoundError extends Error {
  constructor() {
    super("Connected account not found.");
  }
}

export class LastSignInMethodError extends Error {
  constructor() {
    super("Add another sign-in method before removing this one.");
  }
}

export async function deleteConnectedAccountForUser(input: {
  userId: string;
  accountId: string;
}): Promise<void> {
  await prisma.$transaction(
    async (tx) => {
      const account = await tx.authProviderAccount.findFirst({
        where: {
          id: input.accountId,
          userId: input.userId,
          provider: {
            in: [...CONNECTED_ACCOUNT_PROVIDERS],
          },
        },
        select: {
          id: true,
        },
      });

      if (!account) {
        throw new ConnectedAccountNotFoundError();
      }

      const [oauthAccountCount, passkeyCount] = await Promise.all([
        tx.authProviderAccount.count({
          where: {
            userId: input.userId,
            provider: {
              in: [...CONNECTED_ACCOUNT_PROVIDERS],
            },
          },
        }),
        tx.authAuthenticator.count({
          where: { userId: input.userId },
        }),
      ]);

      if (oauthAccountCount <= 1 && passkeyCount === 0) {
        throw new LastSignInMethodError();
      }

      await tx.authProviderAccount.delete({
        where: { id: account.id },
      });
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}
