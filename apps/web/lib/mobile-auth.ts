import "server-only";

import { createHash, randomBytes } from "node:crypto";
import {
  MOBILE_ACCESS_TOKEN_DEFAULT_TTL,
  MOBILE_SESSION_DEFAULT_TTL,
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
import { consumeOneShotKey } from "./request-rate-limit";

const MOBILE_SIGN_IN_CODE_JTI_SCOPE = "mobile-sign-in-code-jti";
const MOBILE_SIGN_IN_CODE_TTL_MS = 5 * 60_000;
const MOBILE_REFRESH_TOKEN_NAMESPACE = "finhance:mobile-refresh-token";
const MAX_MOBILE_SESSION_TTL_MS = 366 * 24 * 60 * 60_000;

export interface MobileSessionTokenPair {
  /** Short-lived bearer token sent to the proxy. */
  token: string;
  /** Opaque, rotated credential kept only in the device keychain. */
  refreshToken: string;
}

export interface MobileSessionSummary {
  id: string;
  deviceLabel: string;
  authenticatedAt: string;
  createdAt: string;
  lastUsedAt: string;
  expiresAt: string;
  isCurrent: boolean;
}

function readAuthSecret(env: NodeJS.ProcessEnv): string {
  const secret = env.AUTH_SECRET?.trim();

  if (!secret) {
    throw new Error("AUTH_SECRET must be configured in hosted auth mode.");
  }

  return secret;
}

export async function mintMobileToken(input: {
  userId: string;
  sessionId: string;
  email?: string | null;
  authenticatedAt: Date;
  env?: NodeJS.ProcessEnv;
}): Promise<string> {
  const env = input.env ?? process.env;

  return mintMobileSessionToken({
    userId: input.userId,
    sessionId: input.sessionId,
    email: input.email,
    authSecret: readAuthSecret(env),
    ttl: resolveDuration(
      env.AUTH_MOBILE_ACCESS_TOKEN_TTL,
      MOBILE_ACCESS_TOKEN_DEFAULT_TTL,
    ).value,
    authenticatedAt: input.authenticatedAt,
  });
}

function resolveDuration(
  configured: string | undefined,
  fallback: string,
): { value: string; milliseconds: number } {
  const candidate = configured?.trim() || fallback;
  const match = /^(\d{1,4})([smhd])$/i.exec(candidate);

  if (!match) {
    return resolveDuration(undefined, fallback);
  }

  const amount = Number(match[1]);
  const unit = match[2]?.toLowerCase();
  const multiplier =
    unit === "s"
      ? 1_000
      : unit === "m"
        ? 60_000
        : unit === "h"
          ? 60 * 60_000
          : 24 * 60 * 60_000;
  const milliseconds = amount * multiplier;

  if (!Number.isSafeInteger(milliseconds) || milliseconds <= 0) {
    return resolveDuration(undefined, fallback);
  }

  return { value: candidate, milliseconds };
}

function resolveMobileSessionDuration(env: NodeJS.ProcessEnv): {
  value: string;
  milliseconds: number;
} {
  const duration = resolveDuration(
    env.AUTH_MOBILE_SESSION_TTL ?? env.AUTH_MOBILE_TOKEN_TTL,
    MOBILE_SESSION_DEFAULT_TTL,
  );

  return duration.milliseconds <= MAX_MOBILE_SESSION_TTL_MS
    ? duration
    : resolveDuration(undefined, MOBILE_SESSION_DEFAULT_TTL);
}

function hashMobileRefreshToken(token: string): string {
  return createHash("sha256")
    .update(`${MOBILE_REFRESH_TOKEN_NAMESPACE}:${token}`)
    .digest("hex");
}

function createMobileRefreshToken(): string {
  return randomBytes(32).toString("base64url");
}

function normalizeDeviceLabel(value: string | null | undefined): string {
  const normalized = value?.replace(/\s+/g, " ").trim();

  if (!normalized) {
    return "Mobile device";
  }

  return normalized.slice(0, 80);
}

async function removeExpiredMobileSessions(now: Date): Promise<void> {
  await prisma.mobileSession.deleteMany({
    where: { expiresAt: { lte: now } },
  });
}

export async function createMobileSession(input: {
  userId: string;
  email?: string | null;
  deviceLabel?: string | null;
  authenticatedAt?: Date;
  env?: NodeJS.ProcessEnv;
}): Promise<MobileSessionTokenPair> {
  const env = input.env ?? process.env;
  const authenticatedAt = input.authenticatedAt ?? new Date();
  const sessionDuration = resolveMobileSessionDuration(env);
  await removeExpiredMobileSessions(authenticatedAt);
  const refreshToken = createMobileRefreshToken();
  const session = await prisma.mobileSession.create({
    data: {
      userId: input.userId,
      refreshTokenHash: hashMobileRefreshToken(refreshToken),
      deviceLabel: normalizeDeviceLabel(input.deviceLabel),
      authenticatedAt,
      expiresAt: new Date(
        authenticatedAt.getTime() + sessionDuration.milliseconds,
      ),
      lastUsedAt: authenticatedAt,
    },
  });

  try {
    return {
      token: await mintMobileToken({
        userId: input.userId,
        sessionId: session.id,
        email: input.email,
        authenticatedAt,
        env,
      }),
      refreshToken,
    };
  } catch (error) {
    await prisma.mobileSession.delete({ where: { id: session.id } });
    throw error;
  }
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
 * Exchanges a sign-in code plus PKCE verifier for a device-bound session.
 * Returns null for any invalid input so the route can answer 401 uniformly.
 */
export async function exchangeMobileSignInCode(input: {
  code: string;
  verifier: string;
  deviceLabel?: string | null;
  env?: NodeJS.ProcessEnv;
}): Promise<MobileSessionTokenPair | null> {
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

  // Do not consume a code before its proof-of-possession check: otherwise a
  // deep-link interceptor could deny the legitimate app's single exchange.
  const consumed = await consumeOneShotKey(
    MOBILE_SIGN_IN_CODE_JTI_SCOPE,
    claims.jti,
    MOBILE_SIGN_IN_CODE_TTL_MS,
  );

  if (!consumed) {
    return null;
  }

  return createMobileSession({
    userId: user.id,
    email: user.email ?? claims.email,
    deviceLabel: input.deviceLabel,
    env,
  });
}

/**
 * Exchanges a one-time opaque refresh token for a newly rotated refresh token
 * and a short-lived bearer. Consumed hashes remain linked to the session so a
 * later replay revokes every credential issued from that session.
 */
export async function refreshMobileSession(input: {
  refreshToken: string;
  env?: NodeJS.ProcessEnv;
}): Promise<MobileSessionTokenPair | null> {
  const refreshToken = input.refreshToken.trim();
  if (!refreshToken) {
    return null;
  }

  const now = new Date();
  await removeExpiredMobileSessions(now);
  const previousHash = hashMobileRefreshToken(refreshToken);
  const nextRefreshToken = createMobileRefreshToken();
  const session = await prisma.$transaction(async (tx) => {
    const activeSession = await tx.mobileSession.findUnique({
      where: { refreshTokenHash: previousHash },
      select: {
        id: true,
        userId: true,
        authenticatedAt: true,
        expiresAt: true,
        revokedAt: true,
        user: {
          select: { id: true, email: true, isActive: true },
        },
      },
    });

    if (!activeSession) {
      const consumed = await tx.mobileConsumedRefreshToken.findUnique({
        where: { tokenHash: previousHash },
        select: { sessionId: true },
      });

      if (consumed) {
        await tx.mobileSession.updateMany({
          where: { id: consumed.sessionId, revokedAt: null },
          data: { revokedAt: now },
        });
      }

      return null;
    }

    if (
      activeSession.revokedAt ||
      activeSession.expiresAt.getTime() <= now.getTime() ||
      !activeSession.user.isActive
    ) {
      return null;
    }

    const rotated = await tx.mobileSession.updateMany({
      where: {
        id: activeSession.id,
        refreshTokenHash: previousHash,
        revokedAt: null,
        expiresAt: { gt: now },
      },
      data: {
        refreshTokenHash: hashMobileRefreshToken(nextRefreshToken),
        lastUsedAt: now,
      },
    });

    if (rotated.count !== 1) {
      const consumed = await tx.mobileConsumedRefreshToken.findUnique({
        where: { tokenHash: previousHash },
        select: { sessionId: true },
      });

      if (consumed) {
        await tx.mobileSession.updateMany({
          where: { id: consumed.sessionId, revokedAt: null },
          data: { revokedAt: now },
        });
      }

      return null;
    }

    await tx.mobileConsumedRefreshToken.create({
      data: {
        sessionId: activeSession.id,
        tokenHash: previousHash,
      },
    });

    return activeSession;
  });

  if (!session) {
    return null;
  }

  return {
    token: await mintMobileToken({
      userId: session.userId,
      sessionId: session.id,
      email: session.user.email,
      authenticatedAt: session.authenticatedAt,
      env: input.env,
    }),
    refreshToken: nextRefreshToken,
  };
}

export async function listMobileSessions(
  userId: string,
  currentSessionId: string | null = null,
): Promise<MobileSessionSummary[]> {
  await removeExpiredMobileSessions(new Date());
  const sessions = await prisma.mobileSession.findMany({
    where: {
      userId,
      revokedAt: null,
      expiresAt: { gt: new Date() },
    },
    select: {
      id: true,
      deviceLabel: true,
      authenticatedAt: true,
      createdAt: true,
      lastUsedAt: true,
      expiresAt: true,
    },
    orderBy: { lastUsedAt: "desc" },
  });

  return sessions.map((session) => ({
    id: session.id,
    deviceLabel: session.deviceLabel,
    authenticatedAt: session.authenticatedAt.toISOString(),
    createdAt: session.createdAt.toISOString(),
    lastUsedAt: session.lastUsedAt.toISOString(),
    expiresAt: session.expiresAt.toISOString(),
    isCurrent: session.id === currentSessionId,
  }));
}

export async function revokeMobileSession(
  userId: string,
  sessionId: string,
): Promise<boolean> {
  const revoked = await prisma.mobileSession.updateMany({
    where: { id: sessionId, userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });

  return revoked.count === 1;
}

export async function revokeAllMobileSessions(userId: string): Promise<void> {
  const revokedAt = new Date();

  await prisma.$transaction([
    prisma.mobileSession.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt },
    }),
    // Retain the timestamp as a belt-and-braces invalidation boundary for
    // bearer tokens minted by older deployments during a rolling release.
    prisma.user.update({
      where: { id: userId },
      data: { mobileTokensRevokedAt: revokedAt },
    }),
  ]);
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

  const session = await prisma.mobileSession.findUnique({
    where: { id: claims.sessionId },
    select: {
      id: true,
      userId: true,
      expiresAt: true,
      revokedAt: true,
      authenticatedAt: true,
      user: {
        select: {
          id: true,
          email: true,
          isActive: true,
          mobileTokensRevokedAt: true,
        },
      },
    },
  });

  if (
    !session ||
    session.userId !== claims.userId ||
    session.revokedAt ||
    session.expiresAt.getTime() <= Date.now()
  ) {
    return { present: true, invalid: true };
  }

  const activeClaims = resolveActiveMobileTokenClaims(claims, session.user);

  if (!activeClaims) {
    return { present: true, invalid: true };
  }

  const touched = await prisma.mobileSession.updateMany({
    where: {
      id: session.id,
      userId: claims.userId,
      revokedAt: null,
      expiresAt: { gt: new Date() },
    },
    data: { lastUsedAt: new Date() },
  });

  if (touched.count !== 1) {
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
