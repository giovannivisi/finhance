import "server-only";

import {
  mintMobileSessionToken,
  readBearerToken,
  verifyMobileSessionToken,
  type MobileTokenClaims,
} from "./mobile-auth.core";

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

  return { present: true, invalid: false, user: claims };
}

export function areDevRedirectsAllowed(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  if (env.AUTH_MOBILE_ALLOW_DEV_REDIRECTS?.trim().toLowerCase() === "true") {
    return true;
  }

  return env.NODE_ENV !== "production";
}
