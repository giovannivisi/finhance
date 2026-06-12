import { jwtVerify, SignJWT } from "jose";

/**
 * Long-lived bearer tokens for the mobile app. They are minted and verified
 * exclusively by the web app (HS256 with AUTH_SECRET) and are never accepted
 * by the API itself — the proxy exchanges them per request for the same
 * short-lived ES256 API JWTs a browser session would get.
 *
 * The token never travels through the browser: the authorize handoff returns
 * a short-lived sign-in code bound to a PKCE challenge, and the app exchanges
 * code + verifier for the token over a direct request. A malicious app
 * squatting the `finhance://` scheme can intercept the code but cannot
 * exchange it without the verifier, which never leaves the legitimate app.
 */
export const MOBILE_TOKEN_AUDIENCE = "finhance-mobile";
export const MOBILE_CODE_AUDIENCE = "finhance-mobile-code";
export const MOBILE_TOKEN_ISSUER = "finhance-web";
export const MOBILE_TOKEN_DEFAULT_TTL = "120d";
export const MOBILE_CODE_TTL = "5m";

/** Fragment key used when handing the sign-in code back to the app. */
export const MOBILE_AUTH_CODE_FRAGMENT_KEY = "code";

const PKCE_CHALLENGE_PATTERN = /^[0-9a-f]{64}$/;

export interface MobileTokenClaims {
  userId: string;
  email: string | null;
  /** Token issue time; null only for tokens minted without an iat claim. */
  issuedAt: Date | null;
}

export interface MobileCodeClaims {
  userId: string;
  email: string | null;
  challenge: string;
}

export interface MobileTokenUserRecord {
  id: string;
  email: string | null;
  isActive: boolean;
  mobileTokensRevokedAt: Date | null;
}

function isIssuedAfterRevocation(
  issuedAt: Date | null,
  revokedAt: Date | null,
): boolean {
  if (!revokedAt) {
    return true;
  }

  if (!issuedAt) {
    return false;
  }

  // JWT iat has second precision, so compare whole seconds: a token minted in
  // the same second as the revocation (e.g. an immediate re-sign-in) survives.
  return (
    Math.floor(issuedAt.getTime() / 1000) >=
    Math.floor(revokedAt.getTime() / 1000)
  );
}

export function resolveActiveMobileTokenClaims(
  claims: MobileTokenClaims,
  user: MobileTokenUserRecord | null | undefined,
): MobileTokenClaims | null {
  if (!user?.isActive || user.id !== claims.userId) {
    return null;
  }

  if (!isIssuedAfterRevocation(claims.issuedAt, user.mobileTokensRevokedAt)) {
    return null;
  }

  return {
    userId: user.id,
    email: user.email ?? claims.email,
    issuedAt: claims.issuedAt,
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
      issuedAt:
        typeof result.payload.iat === "number"
          ? new Date(result.payload.iat * 1000)
          : null,
    };
  } catch {
    return null;
  }
}

export function isValidPkceChallenge(
  value: string | null | undefined,
): boolean {
  return typeof value === "string" && PKCE_CHALLENGE_PATTERN.test(value);
}

export async function computePkceChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(verifier),
  );

  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function verifyPkceVerifier(
  verifier: string,
  challenge: string,
): Promise<boolean> {
  if (!isValidPkceChallenge(challenge)) {
    return false;
  }

  const computed = await computePkceChallenge(verifier);

  let mismatch = 0;

  for (let index = 0; index < challenge.length; index += 1) {
    mismatch |= computed.charCodeAt(index) ^ challenge.charCodeAt(index);
  }

  return mismatch === 0;
}

export async function mintMobileAuthCode(input: {
  userId: string;
  email?: string | null;
  challenge: string;
  authSecret: string;
}): Promise<string> {
  const payload: Record<string, string> = { challenge: input.challenge };

  if (input.email) {
    payload.email = input.email;
  }

  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer(MOBILE_TOKEN_ISSUER)
    .setAudience(MOBILE_CODE_AUDIENCE)
    .setSubject(input.userId)
    .setJti(crypto.randomUUID())
    .setIssuedAt()
    .setExpirationTime(MOBILE_CODE_TTL)
    .sign(toSecretKey(input.authSecret));
}

export async function verifyMobileAuthCode(
  code: string,
  authSecret: string,
): Promise<MobileCodeClaims | null> {
  try {
    const result = await jwtVerify(code, toSecretKey(authSecret), {
      issuer: MOBILE_TOKEN_ISSUER,
      audience: MOBILE_CODE_AUDIENCE,
      algorithms: ["HS256"],
    });

    const userId = result.payload.sub?.trim();
    const challenge = result.payload.challenge;

    if (!userId || typeof challenge !== "string") {
      return null;
    }

    if (!isValidPkceChallenge(challenge)) {
      return null;
    }

    return {
      userId,
      email:
        typeof result.payload.email === "string" ? result.payload.email : null,
      challenge,
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
 * link can never exfiltrate a sign-in code to an attacker-controlled
 * destination.
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

export function buildMobileCodeRedirectLocation(
  redirectTarget: string,
  code: string,
): string {
  return `${redirectTarget}#${MOBILE_AUTH_CODE_FRAGMENT_KEY}=${encodeURIComponent(code)}`;
}
