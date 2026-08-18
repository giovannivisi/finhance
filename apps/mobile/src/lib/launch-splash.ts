import type { LaunchTab } from "./preferences";

// The splash should cover a normal cold API request, but a network problem
// must still surface to the user instead of leaving them on a static screen.
export const INITIAL_DASHBOARD_SPLASH_TIMEOUT_MS = 8_000;

export function shouldWaitForInitialDashboard(
  connected: boolean,
  launchTab: LaunchTab,
): boolean {
  return connected && launchTab === "home";
}

export function shouldHoldNativeSplash({
  appLockReady,
  waitForDashboard,
  dashboardSettled,
  timeoutElapsed,
}: {
  appLockReady: boolean;
  waitForDashboard: boolean;
  dashboardSettled: boolean;
  timeoutElapsed: boolean;
}): boolean {
  return (
    !appLockReady ||
    (waitForDashboard && !dashboardSettled && !timeoutElapsed)
  );
}
