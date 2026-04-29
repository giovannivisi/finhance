"use client";

import React, { createContext, useContext, useEffect, useState } from "react";

type Theme = "light" | "dark";

const THEME_STORAGE_KEY = "finhance-theme";
const HIDE_MONEY_STORAGE_KEY = "finhance-hide-money";
const DASHBOARD_REFRESH_SESSION_KEY = "finhance-dashboard-refresh-attempted";

interface AppPreferencesContextType {
  theme: Theme;
  isHydrated: boolean;
  hideMoney: boolean;
  toggleTheme: () => void;
  toggleHideMoney: () => void;
  hasAttemptedDashboardRefresh: () => boolean;
  markDashboardRefreshAttempted: () => void;
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

  function hasAttemptedDashboardRefresh() {
    try {
      return sessionStorage.getItem(DASHBOARD_REFRESH_SESSION_KEY) === "true";
    } catch {
      return false;
    }
  }

  function markDashboardRefreshAttempted() {
    try {
      sessionStorage.setItem(DASHBOARD_REFRESH_SESSION_KEY, "true");
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
