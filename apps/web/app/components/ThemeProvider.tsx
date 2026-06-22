"use client";

import React, { createContext, useContext, useEffect, useState } from "react";

type Theme = "light" | "dark";

const THEME_STORAGE_KEY = "finhance-theme";
const HIDE_MONEY_STORAGE_KEY = "finhance-hide-money";
const DASHBOARD_REFRESH_SESSION_KEY = "finhance-dashboard-refresh-attempted";
const MISSING_DASHBOARD_REFRESH_SNAPSHOT_KEY = "__missing__";

interface AppPreferencesContextType {
  theme: Theme;
  isHydrated: boolean;
  hideMoney: boolean;
  toggleTheme: () => void;
  toggleHideMoney: () => void;
  hasAttemptedDashboardRefresh: (snapshotKey?: string | null) => boolean;
  markDashboardRefreshAttempted: (snapshotKey?: string | null) => void;
}

const AppPreferencesContext = createContext<
  AppPreferencesContextType | undefined
>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>("dark");
  const [hideMoney, setHideMoney] = useState(false);
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    // Read the initial theme from the document root which was set by the blocking script
    const currentTheme = document.documentElement.getAttribute(
      "data-theme",
    ) as Theme;
    if (currentTheme) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setTheme(currentTheme);
    }

    const storedHideMoney =
      document.documentElement.getAttribute("data-hide-money") === "true";
    setHideMoney(storedHideMoney);
    setIsHydrated(true);
  }, []);

  const toggleTheme = () => {
    const newTheme = theme === "light" ? "dark" : "light";
    setTheme(newTheme);
    document.documentElement.setAttribute("data-theme", newTheme);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, newTheme);
    } catch {
      // Ignore storage errors
    }
  };

  const toggleHideMoney = () => {
    setHideMoney((current) => {
      const next = !current;

      document.documentElement.setAttribute("data-hide-money", String(next));
      try {
        localStorage.setItem(HIDE_MONEY_STORAGE_KEY, String(next));
      } catch {
        // Ignore storage errors
      }

      return next;
    });
  };

  function getDashboardRefreshSnapshotKey(snapshotKey?: string | null) {
    return snapshotKey?.trim() || MISSING_DASHBOARD_REFRESH_SNAPSHOT_KEY;
  }

  function hasAttemptedDashboardRefresh(snapshotKey?: string | null) {
    try {
      return (
        sessionStorage.getItem(DASHBOARD_REFRESH_SESSION_KEY) ===
        getDashboardRefreshSnapshotKey(snapshotKey)
      );
    } catch {
      return false;
    }
  }

  function markDashboardRefreshAttempted(snapshotKey?: string | null) {
    try {
      sessionStorage.setItem(
        DASHBOARD_REFRESH_SESSION_KEY,
        getDashboardRefreshSnapshotKey(snapshotKey),
      );
    } catch {
      // Ignore storage errors
    }
  }

  return (
    <AppPreferencesContext.Provider
      value={{
        theme,
        isHydrated,
        hideMoney,
        toggleTheme,
        toggleHideMoney,
        hasAttemptedDashboardRefresh,
        markDashboardRefreshAttempted,
      }}
    >
      {children}
    </AppPreferencesContext.Provider>
  );
}

export function useAppPreferences() {
  const context = useContext(AppPreferencesContext);
  if (context === undefined) {
    throw new Error("useAppPreferences must be used within a ThemeProvider");
  }
  return context;
}

export function useTheme() {
  const { theme, toggleTheme } = useAppPreferences();
  return { theme, toggleTheme };
}
