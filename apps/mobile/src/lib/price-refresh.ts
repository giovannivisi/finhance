export const AUTOMATIC_PRICE_REFRESH_RETRY_MS = 60_000;

const MISSING_PRICE_REFRESH_SNAPSHOT_KEY = "__missing__";

export interface AutomaticPriceRefreshAttempt {
  snapshotKeys: readonly string[];
  attemptedAtMs: number;
}

export function getPriceRefreshSnapshotKey(
  lastRefreshAt: string | null,
): string {
  return lastRefreshAt ?? MISSING_PRICE_REFRESH_SNAPSHOT_KEY;
}

export function createAutomaticPriceRefreshAttempt(input: {
  lastRefreshAt: string | null;
  refreshedAt?: string | null;
  nowMs: number;
}): AutomaticPriceRefreshAttempt {
  const snapshotKeys = [
    getPriceRefreshSnapshotKey(input.lastRefreshAt),
    input.refreshedAt ? getPriceRefreshSnapshotKey(input.refreshedAt) : null,
  ].filter(
    (snapshotKey, index, allKeys): snapshotKey is string =>
      snapshotKey !== null && allKeys.indexOf(snapshotKey) === index,
  );

  return {
    snapshotKeys,
    attemptedAtMs: input.nowMs,
  };
}

export function getAutomaticPriceRefreshDelay(input: {
  isActive: boolean;
  refreshSuggested?: boolean;
  isRefreshing: boolean;
  lastRefreshAt: string | null;
  lastAttempt: AutomaticPriceRefreshAttempt | null;
  nowMs: number;
  retryMs?: number;
}): number | null {
  if (
    !input.isActive ||
    input.refreshSuggested !== true ||
    input.isRefreshing
  ) {
    return null;
  }

  const snapshotKey = getPriceRefreshSnapshotKey(input.lastRefreshAt);

  if (!input.lastAttempt?.snapshotKeys.includes(snapshotKey)) {
    return 0;
  }

  const retryMs = input.retryMs ?? AUTOMATIC_PRICE_REFRESH_RETRY_MS;
  const elapsedMs = input.nowMs - input.lastAttempt.attemptedAtMs;
  return Math.max(0, retryMs - elapsedMs);
}

export function shouldStartAutomaticPriceRefresh(input: {
  isActive: boolean;
  refreshSuggested?: boolean;
  alreadyStarted: boolean;
}): boolean {
  return (
    input.isActive && input.refreshSuggested === true && !input.alreadyStarted
  );
}

export function formatPriceRefreshStatusText(input: {
  isRefreshing: boolean;
  hasLiveQuotes: boolean;
  lastRefreshAt: string | null;
}): string | null {
  if (input.isRefreshing) {
    return "Updating prices...";
  }

  if (input.hasLiveQuotes || input.lastRefreshAt) {
    return null;
  }

  return "Prices not refreshed yet";
}
