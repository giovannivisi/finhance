import { normalizeNavigationPath } from "@lib/navigation";

const PREFETCH_TTL_MS = 30_000;

const prefetchedPaths = new Map<string, number>();

function cleanupExpiredPrefetches(now: number) {
  for (const [path, prefetchedAt] of prefetchedPaths.entries()) {
    if (now - prefetchedAt > PREFETCH_TTL_MS) {
      prefetchedPaths.delete(path);
    }
  }
}

export function recordNavigationPrefetch(path: string): boolean {
  const normalizedPath = normalizeNavigationPath(path);

  if (!normalizedPath) {
    return false;
  }

  const now = Date.now();
  cleanupExpiredPrefetches(now);

  const lastPrefetchedAt = prefetchedPaths.get(normalizedPath);
  if (
    lastPrefetchedAt !== undefined &&
    now - lastPrefetchedAt <= PREFETCH_TTL_MS
  ) {
    return false;
  }

  prefetchedPaths.set(normalizedPath, now);
  return true;
}

export function hasRecentNavigationPrefetch(path: string | null): boolean {
  const normalizedPath = normalizeNavigationPath(path);

  if (!normalizedPath) {
    return false;
  }

  const now = Date.now();
  cleanupExpiredPrefetches(now);

  const prefetchedAt = prefetchedPaths.get(normalizedPath);
  return prefetchedAt !== undefined && now - prefetchedAt <= PREFETCH_TTL_MS;
}

export function resetNavigationPrefetchesForTests(): void {
  prefetchedPaths.clear();
}
