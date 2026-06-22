import "server-only";

import { cookies } from "next/headers";
import { hashStoredAuthToken } from "./auth-adapter-core";
import { prisma } from "./prisma";

export const RECENT_AUTH_MAX_AGE_MS = 15 * 60 * 1000;
export const RECENT_AUTH_REQUIRED_MESSAGE =
  "Sign in again before changing passkeys.";

const AUTH_SESSION_COOKIE_NAMES = [
  "authjs.session-token",
  "__Secure-authjs.session-token",
  "next-auth.session-token",
  "__Secure-next-auth.session-token",
];

type CookieStore = Awaited<ReturnType<typeof cookies>>;

function readChunkedCookie(store: CookieStore, name: string): string | null {
  const direct = store.get(name)?.value;
  if (direct) {
    return direct;
  }

  const chunks: string[] = [];
  for (let index = 0; ; index += 1) {
    const chunk = store.get(`${name}.${index}`)?.value;
    if (!chunk) {
      break;
    }
    chunks.push(chunk);
  }

  return chunks.length > 0 ? chunks.join("") : null;
}

async function readSessionTokenFromCookies(): Promise<string | null> {
  const store = await cookies();

  for (const name of AUTH_SESSION_COOKIE_NAMES) {
    const token = readChunkedCookie(store, name);
    if (token) {
      return token;
    }
  }

  return null;
}

export async function hasRecentSessionAuthentication(
  userId: string,
  now: Date = new Date(),
): Promise<boolean> {
  const token = await readSessionTokenFromCookies();
  if (!token) {
    return false;
  }

  const session = await prisma.authSession.findUnique({
    where: { sessionToken: hashStoredAuthToken(token, "session") },
    select: {
      userId: true,
      expires: true,
      authenticatedAt: true,
    },
  });

  if (
    !session ||
    session.userId !== userId ||
    session.expires.getTime() <= now.getTime() ||
    !session.authenticatedAt
  ) {
    return false;
  }

  return (
    now.getTime() - session.authenticatedAt.getTime() <= RECENT_AUTH_MAX_AGE_MS
  );
}
