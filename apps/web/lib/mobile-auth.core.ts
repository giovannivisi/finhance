import { jwtVerify, SignJWT } from "jose";

/**
 * Long-lived bearer tokens for the mobile app. They are minted and verified
 * exclusively by the web app (HS256 with AUTH_SECRET) and are never accepted
 * by the API itself — the proxy exchanges them per request for the same
 * short-lived ES256 API JWTs a browser session would get.
 */
export const MOBILE_TOKEN_AUDIENCE = "finhance-mobile";
export const MOBILE_TOKEN_ISSUER = "finhance-web";
export const MOBILE_TOKEN_DEFAULT_TTL = "120d";

/** Fragment key used when handing the token back to the app. */
export const MOBILE_AUTH_TOKEN_FRAGMENT_KEY = "token";

export interface MobileTokenClaims {
  userId: string;
  email: string | null;
}

export interface MobileTokenUserRecord {
  id: string;
  email: string | null;
  isActive: boolean;
}

export function resolveActiveMobileTokenClaims(
  claims: MobileTokenClaims,
  user: MobileTokenUserRecord | null | undefined,
): MobileTokenClaims | null {
  if (!user?.isActive || user.id !== claims.userId) {
    return null;
  }

  return {
    userId: user.id,
    email: user.email ?? claims.email,
  };
}

function toSecretKey(authSecret: string): Uint8Array {
  return new TextEncoder().encode(authSecret);
}

export async function mintMobileSessionToken(input: {
  userId: string;
  email?: string | null;
  authSecret: string;
  ttl?: string;
}): Promise<string> {
  const payload: Record<string, string> = {};

  if (input.email) {
    payload.email = input.email;
  }

  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer(MOBILE_TOKEN_ISSUER)
    .setAudience(MOBILE_TOKEN_AUDIENCE)
    .setSubject(input.userId)
    .setJti(crypto.randomUUID())
    .setIssuedAt()
    .setExpirationTime(input.ttl?.trim() || MOBILE_TOKEN_DEFAULT_TTL)
    .sign(toSecretKey(input.authSecret));
}

export async function verifyMobileSessionToken(
  token: string,
  authSecret: string,
): Promise<MobileTokenClaims | null> {
  try {
    const result = await jwtVerify(token, toSecretKey(authSecret), {
      issuer: MOBILE_TOKEN_ISSUER,
      audience: MOBILE_TOKEN_AUDIENCE,
      algorithms: ["HS256"],
    });

    const userId = result.payload.sub?.trim();

    if (!userId) {
      return null;
    }

    return {
      userId,
      email:
        typeof result.payload.email === "string" ? result.payload.email : null,
    };
  } catch {
    return null;
  }
}

export function readBearerToken(
  authorizationHeader: string | null | undefined,
): string | null {
  if (typeof authorizationHeader !== "string") {
    return null;
  }

  const trimmed = authorizationHeader.trim();

  if (!trimmed.toLowerCase().startsWith("bearer ")) {
    return null;
  }

  const token = trimmed.slice("bearer ".length).trim();
  return token || null;
}

/**
 * Validates the app-provided redirect target for the authorize handoff.
 *
 * Allowed:
 * - `finhance://auth` — the installed app (always)
 * - `exp://…/--/auth` / `exps://…/--/auth` — Expo Go development clients,
 *   only when dev redirects are explicitly allowed
 *
 * Anything else (https, other schemes, other paths) is rejected so a crafted
 * link can never exfiltrate a token to an attacker-controlled destination.
 */
export function resolveMobileRedirectTarget(
  rawRedirect: string | null | undefined,
  options: { allowDevRedirects: boolean },
): string | null {
  const raw = rawRedirect?.trim();

  if (!raw) {
    return null;
  }

  let parsed: URL;

  try {
    parsed = new URL(raw);
  } catch {
    return null;
  }

  if (parsed.username || parsed.password || parsed.search || parsed.hash) {
    return null;
  }

  if (parsed.protocol === "finhance:") {
    const path = parsed.pathname.replaceAll("/", "");
    const isAuthHost = parsed.hostname === "auth" && path === "";
    const isAuthPath = parsed.hostname === "" && path === "auth";

    if (isAuthHost || isAuthPath) {
      return "finhance://auth";
    }

    return null;
  }

  if (
    options.allowDevRedirects &&
    (parsed.protocol === "exp:" || parsed.protocol === "exps:")
  ) {
    if (parsed.pathname.endsWith("/--/auth")) {
      return parsed.toString();
    }

    return null;
  }

  return null;
}

export function buildMobileTokenRedirectLocation(
  redirectTarget: string,
  token: string,
): string {
  return `${redirectTarget}#${MOBILE_AUTH_TOKEN_FRAGMENT_KEY}=${encodeURIComponent(token)}`;
}
