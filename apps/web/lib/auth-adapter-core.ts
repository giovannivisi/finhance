import type {
  Adapter,
  AdapterAccount,
  AdapterSession,
  AdapterUser,
} from "next-auth/adapters";
import { Prisma, PrismaClient } from "@finhance/db";

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
        return mapUser(
          await prisma.user.delete({
            where: { id: userId },
          }),
        );
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
    async createSession(session) {
      return mapSession(
        await prisma.authSession.create({
          data: {
            sessionToken: session.sessionToken,
            userId: session.userId,
            expires: session.expires,
          },
        }),
      );
    },
    async getSessionAndUser(sessionToken) {
      const session = await prisma.authSession.findUnique({
        where: { sessionToken },
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
        session: mapSession(session),
        user: mapUser(session.user),
      };
    },
    async updateSession(session) {
      try {
        const updated = await prisma.authSession.update({
          where: { sessionToken: session.sessionToken },
          data: {
            expires: session.expires,
            userId: session.userId,
          },
        });

        return mapSession(updated);
      } catch (error) {
        if (isNotFoundError(error)) {
          return null;
        }

        throw error;
      }
    },
    async deleteSession(sessionToken) {
      try {
        return mapSession(
          await prisma.authSession.delete({
            where: { sessionToken },
          }),
        );
      } catch (error) {
        if (isNotFoundError(error)) {
          return null;
        }

        throw error;
      }
    },
    async createVerificationToken(token) {
      return prisma.authVerificationToken.create({
        data: token,
      });
    },
    async useVerificationToken({ identifier, token }) {
      try {
        return await prisma.authVerificationToken.delete({
          where: {
            identifier_token: {
              identifier,
              token,
            },
          },
        });
      } catch (error) {
        if (isNotFoundError(error)) {
          return null;
        }

        throw error;
      }
    },
  };
}
