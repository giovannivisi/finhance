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
