/**
 * Pure state machine for the native lock screen. In particular, biometric
 * prompts can emit inactive -> active transitions themselves; only a genuine
 * background event is allowed to relock an already unlocked workspace.
 */
export type AppLockLifecycleAppState =
  | "active"
  | "background"
  | "inactive"
  | "unknown"
  | "extension";

/**
 * Keep short interruptions frictionless while still protecting the workspace
 * after the app has genuinely been left unattended.
 */
export const APP_LOCK_BACKGROUND_GRACE_MS = 30_000;

export interface AuthenticationAttempt {
  id: number;
  generation: number;
}

export interface AppLockLifecycleState {
  enabled: boolean;
  locked: boolean;
  appState: AppLockLifecycleAppState;
  authenticationRequired: boolean;
  activeAttempt: AuthenticationAttempt | null;
  nextAttemptId: number;
  generation: number;
  backgroundedAt: number | null;
}

export function createAppLockLifecycleState(
  enabled: boolean,
  appState: AppLockLifecycleAppState = "active",
): AppLockLifecycleState {
  return {
    enabled,
    locked: enabled,
    appState,
    authenticationRequired: enabled,
    activeAttempt: null,
    nextAttemptId: 1,
    generation: 0,
    backgroundedAt: null,
  };
}

export function setAppLockLifecycleEnabled(
  state: AppLockLifecycleState,
  enabled: boolean,
): AppLockLifecycleState {
  if (!enabled) {
    return {
      ...state,
      enabled: false,
      locked: false,
      authenticationRequired: false,
      activeAttempt: null,
      generation: state.generation + 1,
      backgroundedAt: null,
    };
  }

  if (state.enabled) {
    return state;
  }

  return {
    ...state,
    enabled: true,
    locked: true,
    authenticationRequired: true,
    activeAttempt: null,
    generation: state.generation + 1,
    backgroundedAt: null,
  };
}

/**
 * A passcode was created or verified during this foreground session. It is an
 * intentional local authentication event, so defer the next lock until a real
 * background boundary rather than asking the user to enter the passcode they
 * have just confirmed again.
 */
export function markAppLockLifecycleAuthenticated(
  state: AppLockLifecycleState,
): AppLockLifecycleState {
  if (!state.enabled || state.appState !== "active") {
    return state;
  }

  return {
    ...state,
    locked: false,
    authenticationRequired: false,
    activeAttempt: null,
    backgroundedAt: null,
  };
}

export function updateAppLockLifecycleAppState(
  state: AppLockLifecycleState,
  appState: AppLockLifecycleAppState,
  now: number = Date.now(),
  backgroundGraceMs: number = 0,
): AppLockLifecycleState {
  if (appState === state.appState) {
    return state;
  }

  if (!state.enabled) {
    return { ...state, appState, backgroundedAt: null };
  }

  if (appState === "background") {
    const shouldLockImmediately = backgroundGraceMs <= 0;
    const interruptedAuthentication = state.activeAttempt !== null;

    return {
      ...state,
      appState,
      backgroundedAt: now,
      locked: shouldLockImmediately ? true : state.locked,
      authenticationRequired: shouldLockImmediately
        ? true
        : state.authenticationRequired || interruptedAuthentication,
      // A result from an authentication started before backgrounding must
      // never unlock the app after it returns to the foreground.
      activeAttempt: null,
      generation: state.generation + 1,
    };
  }

  if (appState === "active" && state.backgroundedAt !== null) {
    const graceExpired = now - state.backgroundedAt >= backgroundGraceMs;

    return {
      ...state,
      appState,
      backgroundedAt: null,
      locked: graceExpired ? true : state.locked,
      authenticationRequired: graceExpired
        ? true
        : state.authenticationRequired,
    };
  }

  // An authentication sheet often produces inactive -> active. Preserve the
  // active attempt and do not schedule another prompt in that case.
  return { ...state, appState };
}

/**
 * Reserve exactly one authentication prompt. Callers execute the native
 * authentication after receiving a non-null attempt, then pass it to
 * completeAppLockAuthentication.
 */
export function beginAppLockAuthentication(state: AppLockLifecycleState): {
  state: AppLockLifecycleState;
  attempt: AuthenticationAttempt | null;
} {
  if (
    !state.enabled ||
    !state.locked ||
    !state.authenticationRequired ||
    state.appState !== "active" ||
    state.activeAttempt !== null
  ) {
    return { state, attempt: null };
  }

  const attempt: AuthenticationAttempt = {
    id: state.nextAttemptId,
    generation: state.generation,
  };

  return {
    state: {
      ...state,
      authenticationRequired: false,
      activeAttempt: attempt,
      nextAttemptId: state.nextAttemptId + 1,
    },
    attempt,
  };
}

export function completeAppLockAuthentication(
  state: AppLockLifecycleState,
  attempt: AuthenticationAttempt,
  success: boolean,
): AppLockLifecycleState {
  if (
    state.activeAttempt?.id !== attempt.id ||
    state.activeAttempt.generation !== attempt.generation ||
    state.generation !== attempt.generation
  ) {
    return state;
  }

  // Native biometric sheets commonly leave AppState "inactive" until just
  // after authenticateAsync resolves. A real background transition already
  // changes generation and is rejected above, so accepting this in-flight
  // success during inactive avoids an unnecessary second unlock prompt.
  if (
    success &&
    state.enabled &&
    (state.appState === "active" || state.appState === "inactive")
  ) {
    return {
      ...state,
      locked: false,
      authenticationRequired: false,
      activeAttempt: null,
      backgroundedAt: null,
    };
  }

  return {
    ...state,
    locked: state.enabled,
    authenticationRequired: false,
    activeAttempt: null,
  };
}

/** Allow an explicit Unlock button to retry after a rejected prompt. */
export function requestAppLockAuthentication(
  state: AppLockLifecycleState,
): AppLockLifecycleState {
  if (!state.enabled || !state.locked || state.activeAttempt !== null) {
    return state;
  }

  return {
    ...state,
    authenticationRequired: true,
  };
}
