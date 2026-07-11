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

export interface ConnectedProviderAccountMetadata {
  providerEmail: string | null;
  providerEmailVerified: boolean;
  providerDisplayName: string | null;
}

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

export function getConnectedProviderAccountMetadata(input: {
  provider: ConnectedAccountProvider;
  profile: ProviderProfile;
}): ConnectedProviderAccountMetadata {
  return {
    providerEmail: normalizeEmail(input.profile?.email),
    providerEmailVerified: hasVerifiedLinkedProviderEmail(
      input.provider,
      input.profile,
    ),
    providerDisplayName: getProviderDisplayName(input.provider, input.profile),
  };
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
    return null;
  }

  return {
    email: user.email,
    name: user.name,
    image: user.image,
    connectedAccounts: user.providerAccounts.flatMap((account) => {
      const response = toConnectedAccountResponse(
        account,
        normalizeEmail(user.email),
      );
      return response ? [response] : [];
    }),
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

  const metadata = getConnectedProviderAccountMetadata({
    provider: input.provider,
    profile: input.profile,
  });

  await prisma.authProviderAccount.updateMany({
    where: {
      provider: input.provider,
      providerAccountId: input.providerAccountId,
    },
    data: {
      ...metadata,
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

export class ConnectedAccountAlreadyLinkedError extends Error {
  constructor() {
    super("That provider account is already linked to another user.");
  }
}

/**
 * Persists an OAuth identity only after the mobile app has proved both its
 * current bearer session and the PKCE verifier bound to the browser handoff.
 * Existing links for the same user are refreshed from the just-verified
 * provider profile; a link owned by another user is never reassigned.
 */
export async function linkConnectedAccountForUser(input: {
  userId: string;
  provider: ConnectedAccountProvider;
  providerAccountId: string;
  metadata: ConnectedProviderAccountMetadata;
}): Promise<ConnectedAccountResponse> {
  try {
    return await prisma.$transaction(
      async (tx) => {
        const user = await tx.user.findUnique({
          where: { id: input.userId },
          select: { email: true, isActive: true },
        });

        if (!user?.isActive) {
          throw new ConnectedAccountNotFoundError();
        }

        const existing = await tx.authProviderAccount.findUnique({
          where: {
            provider_providerAccountId: {
              provider: input.provider,
              providerAccountId: input.providerAccountId,
            },
          },
          select: {
            id: true,
            userId: true,
            provider: true,
            providerEmail: true,
            providerEmailVerified: true,
            providerDisplayName: true,
            createdAt: true,
          },
        });

        if (existing && existing.userId !== input.userId) {
          throw new ConnectedAccountAlreadyLinkedError();
        }

        const account = existing
          ? await tx.authProviderAccount.update({
              where: { id: existing.id },
              data: input.metadata,
              select: {
                id: true,
                provider: true,
                providerEmail: true,
                providerEmailVerified: true,
                providerDisplayName: true,
                createdAt: true,
              },
            })
          : await tx.authProviderAccount.create({
              data: {
                userId: input.userId,
                type: "oauth",
                provider: input.provider,
                providerAccountId: input.providerAccountId,
                ...input.metadata,
                createdAt: new Date(),
              },
              select: {
                id: true,
                provider: true,
                providerEmail: true,
                providerEmailVerified: true,
                providerDisplayName: true,
                createdAt: true,
              },
            });

        const response = toConnectedAccountResponse(
          account,
          normalizeEmail(user.email),
        );

        if (!response) {
          throw new ConnectedAccountNotFoundError();
        }

        return response;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  } catch (error) {
    // A concurrent confirmation can pass the initial lookup in two separate
    // serializable transactions. Resolve the unique-key race explicitly so a
    // repeated confirmation by the same user remains idempotent, while a
    // provider identity owned by another user never gets overwritten.
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      const [user, account] = await Promise.all([
        prisma.user.findUnique({
          where: { id: input.userId },
          select: { email: true, isActive: true },
        }),
        prisma.authProviderAccount.findUnique({
          where: {
            provider_providerAccountId: {
              provider: input.provider,
              providerAccountId: input.providerAccountId,
            },
          },
          select: {
            id: true,
            userId: true,
            provider: true,
            providerEmail: true,
            providerEmailVerified: true,
            providerDisplayName: true,
            createdAt: true,
          },
        }),
      ]);

      if (!user?.isActive) {
        throw new ConnectedAccountNotFoundError();
      }

      if (!account || account.userId !== input.userId) {
        throw new ConnectedAccountAlreadyLinkedError();
      }

      const refreshed = await prisma.authProviderAccount.update({
        where: { id: account.id },
        data: input.metadata,
        select: {
          id: true,
          provider: true,
          providerEmail: true,
          providerEmailVerified: true,
          providerDisplayName: true,
          createdAt: true,
        },
      });
      const response = toConnectedAccountResponse(
        refreshed,
        normalizeEmail(user.email),
      );

      if (!response) {
        throw new ConnectedAccountNotFoundError();
      }

      return response;
    }

    throw error;
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
