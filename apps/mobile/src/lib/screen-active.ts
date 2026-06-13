import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { AppState } from "react-native";

/**
 * Tracks whether the current screen is focused (per expo-router) AND the
 * app is in the foreground (per `AppState`). This is the gate used for live
 * polling queries: they should pause as soon as the user navigates away or
 * backgrounds the app, and resume the moment both are true again.
 *
 * The root layout already bridges `AppState` into TanStack Query's
 * `focusManager` for refetch-on-focus behaviour; this hook extends that
 * pattern to per-screen `enabled` flags for `refetchInterval` polling.
 */
export function useIsScreenActive(): boolean {
  const [appActive, setAppActive] = useState(
    () => AppState.currentState === "active",
  );
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (status) => {
      setAppActive(status === "active");
    });

    return () => subscription.remove();
  }, []);

  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, []),
  );

  return appActive && focused;
}
