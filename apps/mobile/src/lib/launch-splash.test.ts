import { describe, expect, it } from "vitest";

import {
  shouldHoldNativeSplash,
  shouldWaitForInitialDashboard,
} from "./launch-splash";

describe("launch splash", () => {
  it("only waits for the initial dashboard on a connected home launch", () => {
    expect(shouldWaitForInitialDashboard(true, "home")).toBe(true);
    expect(shouldWaitForInitialDashboard(false, "home")).toBe(false);
    expect(shouldWaitForInitialDashboard(true, "activity")).toBe(false);
  });

  it("keeps the splash until the app lock and dashboard are ready", () => {
    expect(
      shouldHoldNativeSplash({
        appLockReady: false,
        waitForDashboard: true,
        dashboardSettled: true,
        timeoutElapsed: false,
      }),
    ).toBe(true);
    expect(
      shouldHoldNativeSplash({
        appLockReady: true,
        waitForDashboard: true,
        dashboardSettled: false,
        timeoutElapsed: false,
      }),
    ).toBe(true);
    expect(
      shouldHoldNativeSplash({
        appLockReady: true,
        waitForDashboard: true,
        dashboardSettled: true,
        timeoutElapsed: false,
      }),
    ).toBe(false);
  });

  it("releases the splash after the safe timeout", () => {
    expect(
      shouldHoldNativeSplash({
        appLockReady: true,
        waitForDashboard: true,
        dashboardSettled: false,
        timeoutElapsed: true,
      }),
    ).toBe(false);
  });
});
