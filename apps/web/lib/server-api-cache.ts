const DEFAULT_SERVER_API_CACHE_TTL_MS = 10_000;
const REFERENCE_SERVER_API_CACHE_TTL_MS = 60_000;
const SUPPORT_SERVER_API_CACHE_TTL_MS = 20_000;
const MAX_SERVER_API_CACHE_ENTRIES = 500;
const LOCAL_SERVER_API_CACHE_USER_KEY = "local";

type ServerApiCacheEntry = {
  expiresAt: number;
  value: Promise<unknown>;
};

const serverApiCache = new Map<string, ServerApiCacheEntry>();

function normaliseMethod(method: string | undefined): string {
  return method?.trim().toUpperCase() || "GET";
}

function buildCacheKey(userKey: string, path: string): string {
  return `${userKey}\n${path}`;
}

function cleanupExpiredEntries(now = Date.now()) {
  for (const [key, entry] of serverApiCache.entries()) {
    if (entry.expiresAt <= now) {
      serverApiCache.delete(key);
    }
  }
}

function trimOldestEntries() {
  while (serverApiCache.size > MAX_SERVER_API_CACHE_ENTRIES) {
    const oldestKey = serverApiCache.keys().next().value as string | undefined;

    if (!oldestKey) {
      return;
    }

    serverApiCache.delete(oldestKey);
  }
}

export function resolveServerApiCacheTtl(path: string): number {
  if (
    path.startsWith("/accounts") ||
    path.startsWith("/categories") ||
    path.startsWith("/expense-validation") ||
    path.startsWith("/setup/status") ||
    path.startsWith("/users/me/settings")
  ) {
    return REFERENCE_SERVER_API_CACHE_TTL_MS;
  }

  if (
    path.startsWith("/dashboard/support-data") ||
    path.startsWith("/recurring-rules/has-pending")
  ) {
    return SUPPORT_SERVER_API_CACHE_TTL_MS;
  }

  return DEFAULT_SERVER_API_CACHE_TTL_MS;
}

export function getServerApiCacheUserKey(input: {
  hostedAuthMode: boolean;
  userId?: string | null;
}): string | null {
  if (!input.hostedAuthMode) {
    return LOCAL_SERVER_API_CACHE_USER_KEY;
  }

  const userId = input.userId?.trim();
  return userId ? `user:${userId}` : null;
}

export function isCacheableServerApiRequest(options?: RequestInit): boolean {
  if (!options) {
    return true;
  }

  return (
    normaliseMethod(options.method) === "GET" &&
    !options.body &&
    !options.headers &&
    !options.signal
  );
}

export async function readThroughServerApiCache<T>(input: {
  userKey: string | null;
  path: string;
  load: () => Promise<T>;
}): Promise<T> {
  const ttl = resolveServerApiCacheTtl(input.path);

  if (!input.userKey || ttl <= 0) {
    return input.load();
  }

  const now = Date.now();
  cleanupExpiredEntries(now);

  const key = buildCacheKey(input.userKey, input.path);
  const existing = serverApiCache.get(key);

  if (existing && existing.expiresAt > now) {
    return existing.value as Promise<T>;
  }

  const entry: ServerApiCacheEntry = {
    expiresAt: now + ttl,
    value: Promise.resolve(undefined),
  };
  const value = input.load().catch((error: unknown) => {
    if (serverApiCache.get(key) === entry) {
      serverApiCache.delete(key);
    }

    throw error;
  });
  entry.value = value;

  serverApiCache.set(key, entry);
  trimOldestEntries();

  return value;
}

export function clearServerApiCacheForUser(userKey: string | null): void {
  if (!userKey) {
    return;
  }

  const prefix = `${userKey}\n`;

  for (const key of serverApiCache.keys()) {
    if (key.startsWith(prefix)) {
      serverApiCache.delete(key);
    }
  }
}

export function resetServerApiCacheForTests(): void {
  serverApiCache.clear();
}
