import "server-only";

import type { ConnectedAccountProvider } from "@finhance/shared/users";
import { jwtVerify, SignJWT } from "jose";
import { cookies } from "next/headers";
import { resolveAuthSecret } from "./auth-config";
import { consumeOneShotKey } from "./request-rate-limit";

const WEB_PROVIDER_LINK_ISSUER = "finhance-web";
const WEB_PROVIDER_LINK_AUDIENCE = "finhance-web-provider-link";
const WEB_PROVIDER_LINK_TTL = "5m";
const WEB_PROVIDER_LINK_TTL_MS = 5 * 60 * 1000;
const WEB_PROVIDER_LINK_SCOPE = "web-provider-link-intent";

export const WEB_PROVIDER_LINK_COOKIE = "finhance.provider-link";
export const WEB_PROVIDER_LINK_COOKIE_PATH = "/api/auth";

export interface WebProviderLinkIntent {
  userId: string;
  provider: ConnectedAccountProvider;
  jti: string;
}

function signingKey(): Uint8Array {
  return new TextEncoder().encode(resolveAuthSecret());
}

function isProvider(value: unknown): value is ConnectedAccountProvider {
  return value === "google" || value === "github";
}

function shouldUseSecureCookie(request: Request): boolean {
  const forwardedProtocol = request.headers
    .get("x-forwarded-proto")
    ?.split(",")[0]
    ?.trim()
    .toLowerCase();

  return (
    forwardedProtocol === "https" || new URL(request.url).protocol === "https:"
  );
}

function serializeCookie(
  request: Request,
  value: string,
  maxAge: number,
): string {
  const parts = [
    `${WEB_PROVIDER_LINK_COOKIE}=${encodeURIComponent(value)}`,
    `Path=${WEB_PROVIDER_LINK_COOKIE_PATH}`,
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${maxAge}`,
  ];

  if (shouldUseSecureCookie(request)) {
    parts.push("Secure");
  }

  return parts.join("; ");
}

export async function mintWebProviderLinkIntent(input: {
  request: Request;
  userId: string;
  provider: ConnectedAccountProvider;
}): Promise<string> {
  const userId = input.userId.trim();
  if (!userId) {
    throw new Error("A user is required for provider linking.");
  }

  const token = await new SignJWT({ provider: input.provider })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuer(WEB_PROVIDER_LINK_ISSUER)
    .setAudience(WEB_PROVIDER_LINK_AUDIENCE)
    .setSubject(userId)
    .setJti(crypto.randomUUID())
    .setIssuedAt()
    .setExpirationTime(WEB_PROVIDER_LINK_TTL)
    .sign(signingKey());

  return serializeCookie(input.request, token, WEB_PROVIDER_LINK_TTL_MS / 1000);
}

export function clearWebProviderLinkIntentCookie(request: Request): string {
  return serializeCookie(request, "", 0);
}

export async function readWebProviderLinkIntentFromCookies(): Promise<WebProviderLinkIntent | null> {
  const token = (await cookies()).get(WEB_PROVIDER_LINK_COOKIE)?.value;
  if (!token) {
    return null;
  }

  try {
    const verified = await jwtVerify(token, signingKey(), {
      issuer: WEB_PROVIDER_LINK_ISSUER,
      audience: WEB_PROVIDER_LINK_AUDIENCE,
      algorithms: ["HS256"],
    });
    const userId = verified.payload.sub?.trim();
    const provider = verified.payload.provider;
    const jti = verified.payload.jti?.trim();

    return userId && isProvider(provider) && jti
      ? { userId, provider, jti }
      : null;
  } catch {
    return null;
  }
}

export function consumeWebProviderLinkIntent(
  intent: WebProviderLinkIntent,
): Promise<boolean> {
  return consumeOneShotKey(
    WEB_PROVIDER_LINK_SCOPE,
    intent.jti,
    WEB_PROVIDER_LINK_TTL_MS,
  );
}
