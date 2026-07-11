import { describe, expect, it } from "vitest";

import { resolveAppLockGateVisibility } from "./app-lock-gate";

describe("app-lock gate visibility", () => {
  it("keeps the workspace hidden while the lock gate is visible", () => {
    expect(
      resolveAppLockGateVisibility({
        active: true,
        isEnabled: true,
        legacyPasscodeRequired: false,
        lifecycleLocked: true,
        launchCoverVisible: false,
        status: "configured",
      }),
    ).toEqual({
      gateVisible: true,
      accessibility: {
        accessibilityElementsHidden: true,
        importantForAccessibility: "no-hide-descendants",
      },
    });
  });

  it("uses the launch cover to shield an otherwise unlocked workspace", () => {
    const result = resolveAppLockGateVisibility({
      active: true,
      isEnabled: true,
      legacyPasscodeRequired: false,
      lifecycleLocked: false,
      launchCoverVisible: true,
      status: "configured",
    });

    expect(result.gateVisible).toBe(false);
    expect(result.accessibility.accessibilityElementsHidden).toBe(true);
  });

  it("reveals the workspace only when both protection layers are absent", () => {
    expect(
      resolveAppLockGateVisibility({
        active: true,
        isEnabled: true,
        legacyPasscodeRequired: false,
        lifecycleLocked: false,
        launchCoverVisible: false,
        status: "configured",
      }),
    ).toEqual({
      gateVisible: false,
      accessibility: {
        accessibilityElementsHidden: false,
        importantForAccessibility: "auto",
      },
    });
  });
});
