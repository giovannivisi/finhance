import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useColorScheme } from "react-native";

import { darkColors, lightColors, type ThemeColors } from "./tokens";

export type ThemePreference = "system" | "dark" | "light";

const THEME_PREFERENCE_KEY = "finhance.themePreference";
const HIDE_MONEY_KEY = "finhance.hideMoney";

interface ThemeContextValue {
  colors: ThemeColors;
  scheme: "dark" | "light";
  preference: ThemePreference;
  setPreference: (preference: ThemePreference) => void;
  hideMoney: boolean;
  setHideMoney: (hide: boolean) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const systemScheme = useColorScheme();
  const [preference, setPreferenceState] = useState<ThemePreference>("system");
  const [hideMoney, setHideMoneyState] = useState(false);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const [storedPreference, storedHideMoney] = await Promise.all([
          AsyncStorage.getItem(THEME_PREFERENCE_KEY),
          AsyncStorage.getItem(HIDE_MONEY_KEY),
        ]);

        if (cancelled) {
          return;
        }

        if (
          storedPreference === "system" ||
          storedPreference === "dark" ||
          storedPreference === "light"
        ) {
          setPreferenceState(storedPreference);
        }

        if (storedHideMoney === "true") {
          setHideMoneyState(true);
        }
      } catch {
        // Fall back to defaults when storage is unavailable.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const setPreference = useCallback((next: ThemePreference) => {
    setPreferenceState(next);
    AsyncStorage.setItem(THEME_PREFERENCE_KEY, next).catch(() => undefined);
  }, []);

  const setHideMoney = useCallback((hide: boolean) => {
    setHideMoneyState(hide);
    AsyncStorage.setItem(HIDE_MONEY_KEY, hide ? "true" : "false").catch(
      () => undefined,
    );
  }, []);

  const scheme: "dark" | "light" =
    preference === "system"
      ? systemScheme === "light"
        ? "light"
        : "dark"
      : preference;

  const value = useMemo<ThemeContextValue>(
    () => ({
      colors: scheme === "light" ? lightColors : darkColors,
      scheme,
      preference,
      setPreference,
      hideMoney,
      setHideMoney,
    }),
    [scheme, preference, setPreference, hideMoney, setHideMoney],
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);

  if (!context) {
    throw new Error("useTheme must be used inside ThemeProvider");
  }

  return context;
}

export { radius, spacing, fonts } from "./tokens";
export type { ThemeColors } from "./tokens";
