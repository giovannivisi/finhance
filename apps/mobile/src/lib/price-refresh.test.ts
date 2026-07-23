import { describe, expect, it } from "vitest";

import {
  createAutomaticPriceRefreshAttempt,
  formatPriceRefreshStatusText,
  getAutomaticPriceRefreshDelay,
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

  it("starts automatic refresh immediately when a stale snapshot has not been attempted", () => {
    expect(
      getAutomaticPriceRefreshDelay({
        isActive: true,
        refreshSuggested: true,
        isRefreshing: false,
        lastRefreshAt: "2026-06-13T08:00:00.000Z",
        lastAttempt: null,
        nowMs: 1_000,
      }),
    ).toBe(0);
  });

  it("does not automatically refresh while inactive, fresh, or already refreshing", () => {
    const input = {
      isActive: true,
      refreshSuggested: true,
      isRefreshing: false,
      lastRefreshAt: "2026-06-13T08:00:00.000Z",
      lastAttempt: null,
      nowMs: 1_000,
    };

    expect(
      getAutomaticPriceRefreshDelay({ ...input, isActive: false }),
    ).toBeNull();
    expect(
      getAutomaticPriceRefreshDelay({ ...input, refreshSuggested: false }),
    ).toBeNull();
    expect(
      getAutomaticPriceRefreshDelay({ ...input, isRefreshing: true }),
    ).toBeNull();
  });

  it("does not repeatedly refresh the same stale snapshot", () => {
    const attempt = createAutomaticPriceRefreshAttempt({
      lastRefreshAt: "2026-06-13T08:00:00.000Z",
      nowMs: 1_000,
    });

    expect(
      getAutomaticPriceRefreshDelay({
        isActive: true,
        refreshSuggested: true,
        isRefreshing: false,
        lastRefreshAt: "2026-06-13T08:00:00.000Z",
        lastAttempt: attempt,
        nowMs: 31_000,
      }),
    ).toBeNull();

    expect(
      getAutomaticPriceRefreshDelay({
        isActive: true,
        refreshSuggested: true,
        isRefreshing: false,
        lastRefreshAt: "2026-06-13T08:00:00.000Z",
        lastAttempt: attempt,
        nowMs: 61_000,
      }),
    ).toBeNull();
  });

  it("treats the stored and returned refresh snapshots as the same automatic attempt", () => {
    const attempt = createAutomaticPriceRefreshAttempt({
      lastRefreshAt: "2026-06-13T08:00:00.000Z",
      refreshedAt: "2026-06-13T08:01:00.000Z",
      nowMs: 1_000,
    });

    expect(
      getAutomaticPriceRefreshDelay({
        isActive: true,
        refreshSuggested: true,
        isRefreshing: false,
        lastRefreshAt: "2026-06-13T08:00:00.000Z",
        lastAttempt: attempt,
        nowMs: 2_000,
      }),
    ).toBeNull();

    expect(
      getAutomaticPriceRefreshDelay({
        isActive: true,
        refreshSuggested: true,
        isRefreshing: false,
        lastRefreshAt: "2026-06-13T08:01:00.000Z",
        lastAttempt: attempt,
        nowMs: 2_000,
      }),
    ).toBeNull();
  });
});
