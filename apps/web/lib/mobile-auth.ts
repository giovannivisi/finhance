import "server-only";

import {
  mintMobileAuthCode,
  mintMobileSessionToken,
  readBearerToken,
  resolveActiveMobileTokenClaims,
  verifyMobileAuthCode,
  verifyMobileSessionToken,
  verifyPkceVerifier,
  type MobileTokenClaims,
} from "./mobile-auth.core";
import { prisma } from "./prisma";

function readAuthSecret(env: NodeJS.ProcessEnv): string {
  const secret = env.AUTH_SECRET?.trim();

  if (!secret) {
    throw new Error("AUTH_SECRET must be configured in hosted auth mode.");
  }

  return secret;
}

export async function mintMobileToken(input: {
  userId: string;
  email?: string | null;
  env?: NodeJS.ProcessEnv;
}): Promise<string> {
  const env = input.env ?? process.env;

  return mintMobileSessionToken({
    userId: input.userId,
    email: input.email,
    authSecret: readAuthSecret(env),
    ttl: env.AUTH_MOBILE_TOKEN_TTL,
  });
}

/**
 * Mints the short-lived sign-in code handed back through the authorize
 * redirect. The code is bound to the app's PKCE challenge and is only
 * exchangeable for a session token together with the matching verifier.
 */
export async function mintMobileSignInCode(input: {
  userId: string;
  email?: string | null;
  challenge: string;
  env?: NodeJS.ProcessEnv;
}): Promise<string> {
  const env = input.env ?? process.env;

  return mintMobileAuthCode({
    userId: input.userId,
    email: input.email,
    challenge: input.challenge,
    authSecret: readAuthSecret(env),
  });
}

/**
 * Exchanges a sign-in code plus PKCE verifier for a long-lived mobile token.
 * Returns null for any invalid input so the route can answer 401 uniformly.
 */
export async function exchangeMobileSignInCode(input: {
  code: string;
  verifier: string;
  env?: NodeJS.ProcessEnv;
}): Promise<string | null> {
  const env = input.env ?? process.env;
  const claims = await verifyMobileAuthCode(input.code, readAuthSecret(env));

  if (!claims) {
    return null;
  }

  if (!(await verifyPkceVerifier(input.verifier, claims.challenge))) {
    return null;
  }

  const user = await prisma.user.findUnique({
    where: { id: claims.userId },
    select: { id: true, email: true, isActive: true },
  });

  if (!user?.isActive) {
    return null;
  }

  return mintMobileToken({
    userId: user.id,
    email: user.email ?? claims.email,
    env,
  });
}

/**
 * Resolves the user behind a mobile bearer token, or null when the header is
 * absent. Throws nothing: an invalid token resolves to `{ invalid: true }` so
 * the proxy can answer 401 with a message the app understands.
 */
export async function resolveMobileBearerUser(
  authorizationHeader: string | null,
  env: NodeJS.ProcessEnv = process.env,
): Promise<
  | { present: false }
  | { present: true; invalid: true }
  | { present: true; invalid: false; user: MobileTokenClaims }
> {
  const token = readBearerToken(authorizationHeader);

  if (!token) {
    return { present: false };
  }

  const claims = await verifyMobileSessionToken(token, readAuthSecret(env));

  if (!claims) {
    return { present: true, invalid: true };
  }

  const user = await prisma.user.findUnique({
    where: { id: claims.userId },
    select: {
      id: true,
      email: true,
      isActive: true,
      mobileTokensRevokedAt: true,
    },
  });

  const activeClaims = resolveActiveMobileTokenClaims(claims, user);

  if (!activeClaims) {
    return { present: true, invalid: true };
  }

  return {
    present: true,
    invalid: false,
    user: activeClaims,
  };
}

export function areDevRedirectsAllowed(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  if (env.AUTH_MOBILE_ALLOW_DEV_REDIRECTS?.trim().toLowerCase() === "true") {
    return true;
  }

  return env.NODE_ENV !== "production";
}
