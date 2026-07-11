import { describe, expect, it } from "vitest";

import {
  APP_LOCK_BACKGROUND_GRACE_MS,
  beginAppLockAuthentication,
  completeAppLockAuthentication,
  createAppLockLifecycleState,
  markAppLockLifecycleAuthenticated,
  requestAppLockAuthentication,
  resolveAppLockAccessibility,
  setAppLockLifecycleEnabled,
  updateAppLockLifecycleAppState,
} from "./app-lock-lifecycle";

describe("app-lock lifecycle", () => {
  it("removes the protected workspace from the accessibility tree while locked", () => {
    expect(resolveAppLockAccessibility(true)).toEqual({
      accessibilityElementsHidden: true,
      importantForAccessibility: "no-hide-descendants",
    });
    expect(resolveAppLockAccessibility(false)).toEqual({
      accessibilityElementsHidden: false,
      importantForAccessibility: "auto",
    });
  });

  it("does not re-prompt after biometric authentication emits inactive then active", () => {
    let state = createAppLockLifecycleState(true);
    const first = beginAppLockAuthentication(state);
    state = first.state;

    expect(first.attempt).not.toBeNull();
    state = updateAppLockLifecycleAppState(state, "inactive");
    state = updateAppLockLifecycleAppState(state, "active");

    expect(beginAppLockAuthentication(state).attempt).toBeNull();
    state = completeAppLockAuthentication(state, first.attempt!, true);

    expect(state.locked).toBe(false);
    expect(state.authenticationRequired).toBe(false);
    expect(beginAppLockAuthentication(state).attempt).toBeNull();
  });

  it("accepts a valid biometric result that resolves while the sheet is inactive", () => {
    let state = createAppLockLifecycleState(true);
    const first = beginAppLockAuthentication(state);
    state = updateAppLockLifecycleAppState(first.state, "inactive");

    state = completeAppLockAuthentication(state, first.attempt!, true);

    expect(state.locked).toBe(false);
    expect(state.authenticationRequired).toBe(false);
    state = updateAppLockLifecycleAppState(state, "active");
    expect(beginAppLockAuthentication(state).attempt).toBeNull();
  });

  it("relocks only after a genuine background event and starts one new prompt", () => {
    let state = createAppLockLifecycleState(true);
    const initial = beginAppLockAuthentication(state);
    state = completeAppLockAuthentication(
      initial.state,
      initial.attempt!,
      true,
    );

    state = updateAppLockLifecycleAppState(state, "inactive");
    state = updateAppLockLifecycleAppState(state, "active");
    expect(state.locked).toBe(false);

    state = updateAppLockLifecycleAppState(state, "background");
    expect(state.locked).toBe(true);
    state = updateAppLockLifecycleAppState(state, "active");

    const resumed = beginAppLockAuthentication(state);
    expect(resumed.attempt).toEqual({ id: 2, generation: 1 });
    expect(beginAppLockAuthentication(resumed.state).attempt).toBeNull();
  });

  it("keeps a short app switch unlocked, then relocks after the grace period", () => {
    let state = createAppLockLifecycleState(true);
    const initial = beginAppLockAuthentication(state);
    state = completeAppLockAuthentication(
      initial.state,
      initial.attempt!,
      true,
    );

    state = updateAppLockLifecycleAppState(
      state,
      "background",
      1_000,
      APP_LOCK_BACKGROUND_GRACE_MS,
    );
    expect(state.locked).toBe(false);
    state = updateAppLockLifecycleAppState(
      state,
      "active",
      3_000,
      APP_LOCK_BACKGROUND_GRACE_MS,
    );
    expect(state.locked).toBe(false);
    expect(state.authenticationRequired).toBe(false);

    state = updateAppLockLifecycleAppState(
      state,
      "background",
      10_000,
      APP_LOCK_BACKGROUND_GRACE_MS,
    );
    state = updateAppLockLifecycleAppState(
      state,
      "active",
      40_000,
      APP_LOCK_BACKGROUND_GRACE_MS,
    );

    expect(state.locked).toBe(true);
    expect(state.authenticationRequired).toBe(true);
  });

  it("does not let a stale prompt result unlock after the app backgrounds", () => {
    let state = createAppLockLifecycleState(true);
    const first = beginAppLockAuthentication(state);
    state = first.state;

    state = updateAppLockLifecycleAppState(state, "background");
    state = updateAppLockLifecycleAppState(state, "active");
    const staleResult = completeAppLockAuthentication(
      state,
      first.attempt!,
      true,
    );

    expect(staleResult).toEqual(state);
    expect(staleResult.locked).toBe(true);

    const resumed = beginAppLockAuthentication(staleResult);
    expect(resumed.attempt).toEqual({ id: 2, generation: 1 });
    state = completeAppLockAuthentication(
      resumed.state,
      resumed.attempt!,
      true,
    );
    expect(state.locked).toBe(false);
  });

  it("does not loop automatic prompts after a rejected attempt", () => {
    let state = createAppLockLifecycleState(true);
    const first = beginAppLockAuthentication(state);
    state = completeAppLockAuthentication(first.state, first.attempt!, false);

    expect(state.locked).toBe(true);
    expect(beginAppLockAuthentication(state).attempt).toBeNull();

    state = requestAppLockAuthentication(state);
    const retry = beginAppLockAuthentication(state);
    expect(retry.attempt).toEqual({ id: 2, generation: 0 });
  });

  it("keeps a newly configured foreground session unlocked until backgrounded", () => {
    let state = createAppLockLifecycleState(false);
    state = setAppLockLifecycleEnabled(state, true);
    state = markAppLockLifecycleAuthenticated(state);

    expect(state.locked).toBe(false);
    expect(state.authenticationRequired).toBe(false);

    state = updateAppLockLifecycleAppState(state, "background");
    state = updateAppLockLifecycleAppState(state, "active");

    expect(state.locked).toBe(true);
    expect(beginAppLockAuthentication(state).attempt).toEqual({
      id: 1,
      generation: 2,
    });
  });
});
