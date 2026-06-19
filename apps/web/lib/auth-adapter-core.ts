import { createHash } from "node:crypto";
import type {
  Adapter,
  AdapterAccount,
  AdapterAuthenticator,
  AdapterSession,
  AdapterUser,
} from "next-auth/adapters";
import { Prisma, PrismaClient } from "@finhance/db";

const STORED_AUTH_TOKEN_NAMESPACE = "finhance:auth-token";

function hashStoredAuthToken(
  token: string,
  purpose: "session" | "verification",
): string {
  return createHash("sha256")
    .update(`${STORED_AUTH_TOKEN_NAMESPACE}:${purpose}:${token}`)
    .digest("hex");
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function mapUser(user: {
  id: string;
  email: string;
  emailVerified: Date | null;
  name: string | null;
  image: string | null;
}): AdapterUser {
  return {
    id: user.id,
    email: user.email,
    emailVerified: user.emailVerified,
    name: user.name,
    image: user.image,
  };
}

function mapSession(session: {
  sessionToken: string;
  userId: string;
  expires: Date;
}): AdapterSession {
  return {
    sessionToken: session.sessionToken,
    userId: session.userId,
    expires: session.expires,
  };
}

function mapAccount(account: {
  userId: string;
  type: string;
  provider: string;
  providerAccountId: string;
}): AdapterAccount {
  return {
    userId: account.userId,
    type: account.type as AdapterAccount["type"],
    provider: account.provider,
    providerAccountId: account.providerAccountId,
  };
}

function mapVerificationToken(token: {
  identifier: string;
  token: string;
  expires: Date;
}) {
  return {
    identifier: token.identifier,
    token: token.token,
    expires: token.expires,
  };
}

function mapAuthenticator(authenticator: {
  userId: string;
  providerAccountId: string;
  credentialID: string;
  credentialPublicKey: string;
  counter: number;
  credentialDeviceType: string;
  credentialBackedUp: boolean;
  transports: string | null;
}): AdapterAuthenticator {
  return {
    userId: authenticator.userId,
    providerAccountId: authenticator.providerAccountId,
    credentialID: authenticator.credentialID,
    credentialPublicKey: authenticator.credentialPublicKey,
    counter: authenticator.counter,
    credentialDeviceType: authenticator.credentialDeviceType,
    credentialBackedUp: authenticator.credentialBackedUp,
    transports: authenticator.transports,
  };
}

function isNotFoundError(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2025"
  );
}

export function FinhanceAuthAdapter(prisma: PrismaClient): Adapter {
  return {
    async createUser(user) {
      return mapUser(
        await prisma.user.create({
          data: {
            email: normalizeEmail(user.email),
            emailVerified: user.emailVerified,
            name: user.name,
            image: user.image,
          },
        }),
      );
    },
    async getUser(id) {
      const user = await prisma.user.findUnique({
        where: { id },
      });

      return user ? mapUser(user) : null;
    },
    async getUserByEmail(email) {
      const user = await prisma.user.findUnique({
        where: { email: normalizeEmail(email) },
      });

      return user ? mapUser(user) : null;
    },
    async getUserByAccount({
      provider,
      providerAccountId,
    }: Pick<AdapterAccount, "provider" | "providerAccountId">) {
      const account = await prisma.authProviderAccount.findUnique({
        where: {
          provider_providerAccountId: {
            provider,
            providerAccountId,
          },
        },
        include: {
          user: true,
        },
      });

      return account ? mapUser(account.user) : null;
    },
    async updateUser(user) {
      return mapUser(
        await prisma.user.update({
          where: { id: user.id },
          data: {
            email: user.email ? normalizeEmail(user.email) : undefined,
            emailVerified: user.emailVerified,
            name: user.name,
            image: user.image,
          },
        }),
      );
    },
    async deleteUser(userId) {
      try {
        const user = await prisma.user.update({
          where: { id: userId },
          data: {
            isActive: false,
          },
        });
        await prisma.authSession.deleteMany({
          where: { userId },
        });
        return mapUser(user);
      } catch (error) {
        if (isNotFoundError(error)) {
          return null;
        }

        throw error;
      }
    },
    async linkAccount(account) {
      await prisma.authProviderAccount.create({
        data: {
          userId: account.userId,
          type: account.type,
          provider: account.provider,
          providerAccountId: account.providerAccountId,
        },
      });
    },
    async unlinkAccount({ provider, providerAccountId }) {
      try {
        await prisma.authProviderAccount.delete({
          where: {
            provider_providerAccountId: {
              provider,
              providerAccountId,
            },
          },
        });
      } catch (error) {
        if (!isNotFoundError(error)) {
          throw error;
        }
      }
    },
    async getAccount(providerAccountId, provider) {
      const account = await prisma.authProviderAccount.findUnique({
        where: {
          provider_providerAccountId: {
            provider,
            providerAccountId,
          },
        },
      });

      return account ? mapAccount(account) : null;
    },
    async createSession(session) {
      const sessionTokenHash = hashStoredAuthToken(
        session.sessionToken,
        "session",
      );
      return mapSession({
        ...(await prisma.authSession.create({
          data: {
            sessionToken: sessionTokenHash,
            userId: session.userId,
            expires: session.expires,
          },
        })),
        sessionToken: session.sessionToken,
      });
    },
    async getSessionAndUser(sessionToken) {
      const sessionTokenHash = hashStoredAuthToken(sessionToken, "session");
      const session = await prisma.authSession.findUnique({
        where: { sessionToken: sessionTokenHash },
        include: {
          user: true,
        },
      });

      if (!session) {
        return null;
      }

      if (!session.user.isActive) {
        await prisma.authSession.deleteMany({
          where: { userId: session.user.id },
        });
        return null;
      }

      return {
        session: mapSession({
          ...session,
          sessionToken,
        }),
        user: mapUser(session.user),
      };
    },
    async updateSession(session) {
      const sessionTokenHash = hashStoredAuthToken(
        session.sessionToken,
        "session",
      );

      try {
        const updated = await prisma.authSession.update({
          where: { sessionToken: sessionTokenHash },
          data: {
            expires: session.expires,
            userId: session.userId,
          },
        });

        return mapSession({
          ...updated,
          sessionToken: session.sessionToken,
        });
      } catch (error) {
        if (isNotFoundError(error)) {
          return null;
        }

        throw error;
      }
    },
    async deleteSession(sessionToken) {
      const sessionTokenHash = hashStoredAuthToken(sessionToken, "session");

      try {
        return mapSession({
          ...(await prisma.authSession.delete({
            where: { sessionToken: sessionTokenHash },
          })),
          sessionToken,
        });
      } catch (error) {
        if (isNotFoundError(error)) {
          return null;
        }

        throw error;
      }
    },
    async createVerificationToken(token) {
      const tokenHash = hashStoredAuthToken(token.token, "verification");

      return mapVerificationToken({
        ...(await prisma.authVerificationToken.create({
          data: {
            identifier: token.identifier,
            token: tokenHash,
            expires: token.expires,
          },
        })),
        token: token.token,
      });
    },
    async useVerificationToken({ identifier, token }) {
      const tokenHash = hashStoredAuthToken(token, "verification");

      try {
        return mapVerificationToken({
          ...(await prisma.authVerificationToken.delete({
            where: {
              identifier_token: {
                identifier,
                token: tokenHash,
              },
            },
          })),
          token,
        });
      } catch (error) {
        if (isNotFoundError(error)) {
          return null;
        }

        throw error;
      }
    },
    async getAuthenticator(credentialID) {
      const authenticator = await prisma.authAuthenticator.findUnique({
        where: { credentialID },
      });

      return authenticator ? mapAuthenticator(authenticator) : null;
    },
    async createAuthenticator(authenticator) {
      return mapAuthenticator(
        await prisma.authAuthenticator.create({
          data: {
            userId: authenticator.userId,
            providerAccountId: authenticator.providerAccountId,
            credentialID: authenticator.credentialID,
            credentialPublicKey: authenticator.credentialPublicKey,
            counter: authenticator.counter,
            credentialDeviceType: authenticator.credentialDeviceType,
            credentialBackedUp: authenticator.credentialBackedUp,
            transports: authenticator.transports ?? null,
          },
        }),
      );
    },
    async listAuthenticatorsByUserId(userId) {
      const authenticators = await prisma.authAuthenticator.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
      });

      return authenticators.map(mapAuthenticator);
    },
    async updateAuthenticatorCounter(credentialID, newCounter) {
      return mapAuthenticator(
        await prisma.authAuthenticator.update({
          where: { credentialID },
          data: { counter: newCounter },
        }),
      );
    },
  };
}
