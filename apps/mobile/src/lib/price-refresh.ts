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
  formatTimestamp: (value: string) => string;
}): string {
  if (input.isRefreshing) {
    return "Refreshing prices...";
  }

  if (input.hasLiveQuotes) {
    return input.lastRefreshAt
      ? `Live quotes updating · stored refresh ${input.formatTimestamp(
          input.lastRefreshAt,
        )}`
      : "Live quotes updating · no stored refresh yet";
  }

  return input.lastRefreshAt
    ? `Stored refresh ${input.formatTimestamp(input.lastRefreshAt)}`
    : "Prices not refreshed yet";
}
