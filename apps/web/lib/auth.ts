import NextAuth, { type NextAuthConfig } from "next-auth";
import GitHub, {
  type GitHubEmail,
  type GitHubProfile,
} from "next-auth/providers/github";
import Google from "next-auth/providers/google";
import Passkey from "next-auth/providers/passkey";
import { FinhanceAuthAdapter } from "@lib/auth-adapter";
import { isHostedAuthMode } from "@lib/auth-mode";
import {
  captureLinkedProviderAccountMetadata,
  getConnectedProviderAccountMetadata,
  isConnectedAccountProvider,
} from "@lib/connected-accounts";
import {
  buildMobileProviderLinkCompletePath,
  hasMobileProviderLinkAuthCallbackTarget,
  mintMobileProviderLinkResult,
  readMobileProviderLinkStateFromCookies,
} from "@lib/mobile-provider-link";
import { resolveHostedSignInDecision } from "@lib/auth-policy";
import {
  readRequiredHostedEnv,
  resolveAuthSignupMode,
  resolveAuthSecret,
  resolveBootstrapEmail,
} from "@lib/auth-config";
import { prisma } from "@lib/prisma";
import { resolveSessionUserIdFromCookies } from "@lib/recent-auth";

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
    Passkey({
      name: "Passkey",
      getUserInfo: async () => null,
    }),
    createGitHubProvider(),
  ];
}

function maskEmailForLog(email: string | undefined): string {
  if (!email) {
    return "<no email>";
  }

  const [localPart, domain] = email.split("@");

  if (!domain) {
    return "***";
  }

  return `${localPart.slice(0, 1)}***@${domain}`;
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

        const mobileProviderLink = await readMobileProviderLinkStateFromCookies();

        if (
          mobileProviderLink &&
          (await hasMobileProviderLinkAuthCallbackTarget()) &&
          account?.provider === mobileProviderLink.provider &&
          account.providerAccountId?.trim()
        ) {
          const metadata = getConnectedProviderAccountMetadata({
            provider: mobileProviderLink.provider,
            profile: profile as Record<string, unknown>,
          });

          // A provider without a verified email cannot safely be used as a
          // future sign-in method, so do not hand a pending link back to the
          // app for confirmation.
          if (!metadata.providerEmail || !metadata.providerEmailVerified) {
            return false;
          }

          // Returning a URL here stops Auth.js before handleLoginOrRegister,
          // which means the OAuth identity is not persisted until the mobile
          // app proves its matching bearer session and PKCE verifier at the
          // dedicated confirmation endpoint.
          const result = await mintMobileProviderLinkResult({
            start: mobileProviderLink,
            accountId: account.providerAccountId,
            metadata,
          });

          return buildMobileProviderLinkCompletePath(result);
        }

        const normalizedEmail =
          typeof user.email === "string" && user.email.trim()
            ? user.email.trim().toLowerCase()
            : typeof profile?.email === "string" && profile.email.trim()
              ? profile.email.trim().toLowerCase()
              : undefined;

        const existingUser = normalizedEmail
          ? await prisma.user.findUnique({
              where: { email: normalizedEmail },
            })
          : null;
        const linkingSessionUserId =
          account?.provider && isConnectedAccountProvider(account.provider)
            ? await resolveSessionUserIdFromCookies()
            : null;
        const linkedAccount =
          linkingSessionUserId && account?.provider && account.providerAccountId
            ? await prisma.authProviderAccount.findUnique({
                where: {
                  provider_providerAccountId: {
                    provider: account.provider,
                    providerAccountId: account.providerAccountId,
                  },
                },
                select: { userId: true },
              })
            : null;

        const allowed = resolveHostedSignInDecision({
          provider: account?.provider ?? undefined,
          profile: profile ?? undefined,
          userEmail: normalizedEmail,
          existingUser,
          bootstrapEmail: resolveBootstrapEmail(),
          signupMode: resolveAuthSignupMode(),
          linkingSessionUserId,
          linkedAccountUserId: linkingSessionUserId
            ? (linkedAccount?.userId ?? null)
            : undefined,
        });

        // Accounts auto-link across providers by verified email, so record
        // which provider each sign-in used to keep that path auditable. The
        // email is masked so platform logs do not retain the full address.
        console.info(
          `[auth] sign-in ${allowed ? "allowed" : "denied"} via ${
            account?.provider ?? "unknown"
          } for ${maskEmailForLog(normalizedEmail)}`,
        );

        return allowed;
      },
      async session({ session, user }) {
        if (session.user) {
          session.user.id = user.id;
        }

        return session;
      },
    },
    events: {
      async signIn({ account, profile }) {
        await captureLinkedProviderAccountMetadata({
          provider: account?.provider,
          providerAccountId: account?.providerAccountId,
          profile: profile as Record<string, unknown>,
        });
      },
      async linkAccount({ account, profile }) {
        await captureLinkedProviderAccountMetadata({
          provider: account.provider,
          providerAccountId: account.providerAccountId,
          profile: profile as Record<string, unknown>,
        });
      },
    },
    experimental: {
      enableWebAuthn: true,
    },
  };
}

export const { handlers, auth, signIn, signOut } = NextAuth(buildAuthConfig());
