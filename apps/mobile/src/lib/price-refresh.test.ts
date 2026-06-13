import { describe, expect, it } from "vitest";

import {
  formatPriceRefreshStatusText,
  shouldStartAutomaticPriceRefresh,
} from "./price-refresh";

describe("price refresh helpers", () => {
  it("starts automatic refresh only when the active screen has suggested pricing refresh", () => {
    expect(
      shouldStartAutomaticPriceRefresh({
        isActive: true,
        refreshSuggested: true,
        alreadyStarted: false,
      }),
    ).toBe(true);

    expect(
      shouldStartAutomaticPriceRefresh({
        isActive: false,
        refreshSuggested: true,
        alreadyStarted: false,
      }),
    ).toBe(false);
    expect(
      shouldStartAutomaticPriceRefresh({
        isActive: true,
        refreshSuggested: false,
        alreadyStarted: false,
      }),
    ).toBe(false);
    expect(
      shouldStartAutomaticPriceRefresh({
        isActive: true,
        refreshSuggested: true,
        alreadyStarted: true,
      }),
    ).toBe(false);
  });

  it("keeps dashboard refresh copy short", () => {
    expect(
      formatPriceRefreshStatusText({
        isRefreshing: true,
        hasLiveQuotes: false,
        lastRefreshAt: "2026-06-13T08:00:00.000Z",
      }),
    ).toBe("Updating prices...");

    expect(
      formatPriceRefreshStatusText({
        isRefreshing: false,
        hasLiveQuotes: true,
        lastRefreshAt: "2026-06-13T08:00:00.000Z",
      }),
    ).toBeNull();

    expect(
      formatPriceRefreshStatusText({
        isRefreshing: false,
        hasLiveQuotes: false,
        lastRefreshAt: "2026-06-13T08:00:00.000Z",
      }),
    ).toBeNull();

    expect(
      formatPriceRefreshStatusText({
        isRefreshing: false,
        hasLiveQuotes: false,
        lastRefreshAt: null,
      }),
    ).toBe("Prices not refreshed yet");
  });
});
