import NextAuth, { type NextAuthConfig } from "next-auth";
import GitHub, {
  type GitHubEmail,
  type GitHubProfile,
} from "next-auth/providers/github";
import Google, { type GoogleProfile } from "next-auth/providers/google";
import { FinhanceAuthAdapter } from "@lib/auth-adapter";
import { isHostedAuthMode } from "@lib/auth-mode";
import {
  readRequiredHostedEnv,
  resolveAuthSecret,
  resolveBootstrapEmail,
} from "@lib/auth-config";
import { prisma } from "@lib/prisma";

type VerifiedGitHubProfile = GitHubProfile & {
  email_verified?: boolean;
};

function createGitHubProvider(env: NodeJS.ProcessEnv = process.env) {
  const clientId = readRequiredHostedEnv("AUTH_GITHUB_ID", env);
  const clientSecret = readRequiredHostedEnv("AUTH_GITHUB_SECRET", env);

  return GitHub({
    clientId,
    clientSecret,
    allowDangerousEmailAccountLinking: true,
    userinfo: {
      url: "https://api.github.com/user",
      async request({
        tokens,
        provider,
      }: {
        tokens: { access_token?: string | null };
        provider: { userinfo?: { url?: string | URL } };
      }) {
        const headers = {
          Authorization: `Bearer ${tokens.access_token}`,
          "User-Agent": "authjs",
        };
        const profile = (await fetch(
          provider.userinfo?.url ?? "https://api.github.com/user",
          {
            headers,
          },
        ).then(async (response) => response.json())) as GitHubProfile;
        const emailResponse = await fetch(
          "https://api.github.com/user/emails",
          {
            headers,
          },
        );

        let primaryEmail: GitHubEmail | undefined;
        if (emailResponse.ok) {
          const emails = (await emailResponse.json()) as GitHubEmail[];
          primaryEmail = emails.find((entry) => entry.primary) ?? emails[0];
        }

        if (primaryEmail?.email) {
          profile.email = primaryEmail.email;
        }

        return {
          ...profile,
          email_verified: primaryEmail?.verified ?? false,
        } satisfies VerifiedGitHubProfile;
      },
    },
  });
}

function createProviders() {
  if (!isHostedAuthMode()) {
    return [];
  }

  return [
    Google({
      clientId: readRequiredHostedEnv("AUTH_GOOGLE_ID"),
      clientSecret: readRequiredHostedEnv("AUTH_GOOGLE_SECRET"),
      allowDangerousEmailAccountLinking: true,
    }),
    createGitHubProvider(),
  ];
}

function hasVerifiedEmail(
  provider: string | undefined,
  profile: Record<string, unknown> | undefined,
): boolean {
  if (!provider || !profile) {
    return false;
  }

  if (provider === "google") {
    return Boolean((profile as GoogleProfile).email_verified);
  }

  if (provider === "github") {
    return Boolean((profile as VerifiedGitHubProfile).email_verified);
  }

  return false;
}

function buildAuthConfig(): NextAuthConfig {
  return {
    adapter: FinhanceAuthAdapter(prisma),
    session: {
      strategy: "database",
    },
    secret: resolveAuthSecret(),
    trustHost: true,
    providers: createProviders(),
    callbacks: {
      async signIn({ account, profile, user }) {
        if (!isHostedAuthMode()) {
          return true;
        }

        const normalizedEmail =
          typeof user.email === "string" && user.email.trim()
            ? user.email.trim().toLowerCase()
            : typeof profile?.email === "string" && profile.email.trim()
              ? profile.email.trim().toLowerCase()
              : null;

        if (
          !normalizedEmail ||
          !hasVerifiedEmail(
            account?.provider ?? undefined,
            profile ?? undefined,
          )
        ) {
          return false;
        }

        const existingUser = await prisma.user.findUnique({
          where: { email: normalizedEmail },
        });

        if (existingUser) {
          return existingUser.isActive;
        }

        return normalizedEmail === resolveBootstrapEmail();
      },
      async session({ session, user }) {
        if (session.user) {
          session.user.id = user.id;
        }

        return session;
      },
    },
  };
}

export const { handlers, auth, signIn, signOut } = NextAuth(buildAuthConfig());
