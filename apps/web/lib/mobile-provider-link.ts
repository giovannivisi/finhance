import { compactDecrypt, CompactEncrypt, jwtVerify, SignJWT } from "jose";
import { cookies } from "next/headers";
import type { ConnectedAccountProvider } from "@finhance/shared/users";
import { isValidPkceChallenge } from "@lib/mobile-auth.core";

const MOBILE_PROVIDER_LINK_ISSUER = "finhance-web";
const MOBILE_PROVIDER_LINK_START_AUDIENCE =
  "finhance-mobile-provider-link-start";
const MOBILE_PROVIDER_LINK_RESULT_AUDIENCE =
  "finhance-mobile-provider-link-result";

export const MOBILE_PROVIDER_LINK_TTL = "5m";
export const MOBILE_PROVIDER_LINK_TTL_MS = 5 * 60 * 1000;
export const MOBILE_PROVIDER_LINK_COOKIE = "finhance.mobile-provider-link";
export const MOBILE_PROVIDER_LINK_COOKIE_PATH = "/api";
export const MOBILE_PROVIDER_LINK_COMPLETE_PATH =
  "/api/mobile/connected-accounts/link/complete";
export const MOBILE_PROVIDER_LINK_START_SCOPE = "mobile-provider-link-start";
export const MOBILE_PROVIDER_LINK_RESULT_SCOPE = "mobile-provider-link-result";

export interface MobileProviderLinkStartClaims {
  userId: string;
  provider: ConnectedAccountProvider;
  challenge: string;
  redirect: string;
  jti: string;
}

export interface MobileProviderLinkResultClaims
  extends MobileProviderLinkStartClaims {
  accountId: string;
  providerEmail: string | null;
  providerEmailVerified: boolean;
  providerDisplayName: string | null;
}

export interface MobileProviderLinkAccountMetadata {
  providerEmail: string | null;
  providerEmailVerified: boolean;
  providerDisplayName: string | null;
}

function readAuthSecret(env: NodeJS.ProcessEnv): string {
  const secret = env.AUTH_SECRET?.trim();

  if (!secret) {
    throw new Error("AUTH_SECRET must be configured in hosted auth mode.");
  }

  return secret;
}

function toSigningKey(authSecret: string): Uint8Array {
  return new TextEncoder().encode(authSecret);
}

async function toEncryptionKey(authSecret: string): Promise<Uint8Array> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(authSecret),
  );

  return new Uint8Array(digest);
}

function isConnectedAccountProvider(
  value: unknown,
): value is ConnectedAccountProvider {
  return value === "google" || value === "github";
}

function readNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed || null;
}

function readNullableString(value: unknown): string | null | undefined {
  if (value === null) {
    return null;
  }

  return readNonEmptyString(value) ?? undefined;
}

function parseStartClaims(payload: Record<string, unknown>): MobileProviderLinkStartClaims | null {
  const userId = readNonEmptyString(payload.sub);
  const provider = payload.provider;
  const challenge = readNonEmptyString(payload.challenge);
  const redirect = readNonEmptyString(payload.redirect);
  const jti = readNonEmptyString(payload.jti);

  if (
    !userId ||
    !isConnectedAccountProvider(provider) ||
    !challenge ||
    !isValidPkceChallenge(challenge) ||
    !redirect ||
    !jti
  ) {
    return null;
  }

  return { userId, provider, challenge, redirect, jti };
}

function parseResultClaims(
  payload: Record<string, unknown>,
): MobileProviderLinkResultClaims | null {
  const start = parseStartClaims(payload);
  const accountId = readNonEmptyString(payload.accountId);
  const providerEmail = readNullableString(payload.providerEmail);
  const providerDisplayName = readNullableString(payload.providerDisplayName);

  if (
    !start ||
    !accountId ||
    providerEmail === undefined ||
    providerDisplayName === undefined ||
    typeof payload.providerEmailVerified !== "boolean"
  ) {
    return null;
  }

  return {
    ...start,
    accountId,
    providerEmail,
    providerEmailVerified: payload.providerEmailVerified,
    providerDisplayName,
  };
}

async function mintSecureToken(input: {
  audience: string;
  payload: Record<string, string | boolean | null>;
  userId: string;
  jti: string;
  authSecret: string;
}): Promise<string> {
  const signed = await new SignJWT(input.payload)
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuer(MOBILE_PROVIDER_LINK_ISSUER)
    .setAudience(input.audience)
    .setSubject(input.userId)
    .setJti(input.jti)
    .setIssuedAt()
    .setExpirationTime(MOBILE_PROVIDER_LINK_TTL)
    .sign(toSigningKey(input.authSecret));

  return new CompactEncrypt(new TextEncoder().encode(signed))
    .setProtectedHeader({ alg: "dir", enc: "A256GCM", cty: "JWT" })
    .encrypt(await toEncryptionKey(input.authSecret));
}

async function verifySecureToken(input: {
  token: string;
  audience: string;
  authSecret: string;
}): Promise<Record<string, unknown> | null> {
  try {
    const encrypted = await compactDecrypt(
      input.token,
      await toEncryptionKey(input.authSecret),
    );

    if (encrypted.protectedHeader.cty !== "JWT") {
      return null;
    }

    const signed = new TextDecoder().decode(encrypted.plaintext);
    const verified = await jwtVerify(signed, toSigningKey(input.authSecret), {
      issuer: MOBILE_PROVIDER_LINK_ISSUER,
      audience: input.audience,
      algorithms: ["HS256"],
    });

    return verified.payload as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * The browser handoff is opaque as well as authenticated. OAuth providers,
 * browser history, and any intermediary never see the target user or the
 * app's PKCE challenge in plaintext.
 */
export async function mintMobileProviderLinkStart(input: {
  userId: string;
  provider: ConnectedAccountProvider;
  challenge: string;
  redirect: string;
  env?: NodeJS.ProcessEnv;
}): Promise<string> {
  const userId = input.userId.trim();

  if (!userId || !isValidPkceChallenge(input.challenge)) {
    throw new Error("Invalid mobile provider link payload.");
  }

  return mintSecureToken({
    audience: MOBILE_PROVIDER_LINK_START_AUDIENCE,
    payload: {
      provider: input.provider,
      challenge: input.challenge,
      redirect: input.redirect,
    },
    userId,
    jti: crypto.randomUUID(),
    authSecret: readAuthSecret(input.env ?? process.env),
  });
}

export async function verifyMobileProviderLinkStart(
  token: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<MobileProviderLinkStartClaims | null> {
  const payload = await verifySecureToken({
    token,
    audience: MOBILE_PROVIDER_LINK_START_AUDIENCE,
    authSecret: readAuthSecret(env),
  });

  return payload ? parseStartClaims(payload) : null;
}

export async function mintMobileProviderLinkResult(input: {
  start: MobileProviderLinkStartClaims;
  accountId: string;
  metadata: MobileProviderLinkAccountMetadata;
  env?: NodeJS.ProcessEnv;
}): Promise<string> {
  const accountId = input.accountId.trim();

  if (!accountId) {
    throw new Error("Invalid provider account id.");
  }

  return mintSecureToken({
    audience: MOBILE_PROVIDER_LINK_RESULT_AUDIENCE,
    payload: {
      provider: input.start.provider,
      challenge: input.start.challenge,
      redirect: input.start.redirect,
      accountId,
      providerEmail: input.metadata.providerEmail,
      providerEmailVerified: input.metadata.providerEmailVerified,
      providerDisplayName: input.metadata.providerDisplayName,
    },
    userId: input.start.userId,
    jti: crypto.randomUUID(),
    authSecret: readAuthSecret(input.env ?? process.env),
  });
}

export async function verifyMobileProviderLinkResult(
  token: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<MobileProviderLinkResultClaims | null> {
  const payload = await verifySecureToken({
    token,
    audience: MOBILE_PROVIDER_LINK_RESULT_AUDIENCE,
    authSecret: readAuthSecret(env),
  });

  return payload ? parseResultClaims(payload) : null;
}

export function buildMobileProviderLinkCompletePath(code: string): string {
  return `${MOBILE_PROVIDER_LINK_COMPLETE_PATH}?code=${encodeURIComponent(code)}`;
}

function shouldUseSecureCookie(request: Request): boolean {
  const forwardedProtocol = request.headers
    .get("x-forwarded-proto")
    ?.split(",")[0]
    ?.trim()
    .toLowerCase();

  return forwardedProtocol === "https" || new URL(request.url).protocol === "https:";
}

function serializeCookie(input: {
  request: Request;
  value: string;
  maxAgeSeconds: number;
}): string {
  const parts = [
    `${MOBILE_PROVIDER_LINK_COOKIE}=${encodeURIComponent(input.value)}`,
    `Path=${MOBILE_PROVIDER_LINK_COOKIE_PATH}`,
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${input.maxAgeSeconds}`,
  ];

  if (shouldUseSecureCookie(input.request)) {
    parts.push("Secure");
  }

  return parts.join("; ");
}

export function createMobileProviderLinkCookie(
  request: Request,
  state: string,
): string {
  return serializeCookie({
    request,
    value: state,
    maxAgeSeconds: MOBILE_PROVIDER_LINK_TTL_MS / 1000,
  });
}

export function clearMobileProviderLinkCookie(request: Request): string {
  return serializeCookie({ request, value: "", maxAgeSeconds: 0 });
}

function readRequestCookie(request: Request, name: string): string | null {
  const cookieHeader = request.headers.get("cookie");

  if (!cookieHeader) {
    return null;
  }

  for (const entry of cookieHeader.split(";")) {
    const [rawName, ...rawValue] = entry.trim().split("=");

    if (rawName !== name) {
      continue;
    }

    try {
      return decodeURIComponent(rawValue.join("="));
    } catch {
      return null;
    }
  }

  return null;
}

export async function readMobileProviderLinkStateFromRequest(
  request: Request,
): Promise<MobileProviderLinkStartClaims | null> {
  const token = readRequestCookie(request, MOBILE_PROVIDER_LINK_COOKIE);
  return token ? verifyMobileProviderLinkStart(token) : null;
}

/**
 * Auth.js callback functions do not receive a Request. They do, however, run
 * in the callback request's async context, so this reads the short-lived,
 * HttpOnly handoff cookie without ever exposing it to client JavaScript.
 */
export async function readMobileProviderLinkStateFromCookies(): Promise<MobileProviderLinkStartClaims | null> {
  const token = (await cookies()).get(MOBILE_PROVIDER_LINK_COOKIE)?.value;
  return token ? verifyMobileProviderLinkStart(token) : null;
}
