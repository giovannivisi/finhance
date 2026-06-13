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

  it("distinguishes live quote polling from stored refresh timestamps", () => {
    const formatTimestamp = (value: string) => `formatted ${value}`;

    expect(
      formatPriceRefreshStatusText({
        isRefreshing: true,
        hasLiveQuotes: false,
        lastRefreshAt: "2026-06-13T08:00:00.000Z",
        formatTimestamp,
      }),
    ).toBe("Refreshing prices...");

    expect(
      formatPriceRefreshStatusText({
        isRefreshing: false,
        hasLiveQuotes: true,
        lastRefreshAt: "2026-06-13T08:00:00.000Z",
        formatTimestamp,
      }),
    ).toBe(
      "Live quotes updating · stored refresh formatted 2026-06-13T08:00:00.000Z",
    );

    expect(
      formatPriceRefreshStatusText({
        isRefreshing: false,
        hasLiveQuotes: false,
        lastRefreshAt: "2026-06-13T08:00:00.000Z",
        formatTimestamp,
      }),
    ).toBe("Stored refresh formatted 2026-06-13T08:00:00.000Z");
  });
});
