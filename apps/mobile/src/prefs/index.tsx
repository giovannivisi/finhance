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

import { setFormatConfig, type FormatConfig } from "@/lib/format-config";
import {
  detectDeviceLocale,
  parseBooleanPref,
  parseClockFormat,
  parseLaunchTab,
  resolveHour12,
  type ClockFormat,
  type LaunchTab,
} from "@/lib/preferences";

const CLOCK_FORMAT_KEY = "finhance.clockFormat";
const DEVICE_FORMATS_KEY = "finhance.deviceFormats";
const LAUNCH_TAB_KEY = "finhance.launchTab";
const APP_LOCK_KEY = "finhance.appLock";

interface AppPreferencesContextValue {
  clockFormat: ClockFormat;
  setClockFormat: (clockFormat: ClockFormat) => void;
  useDeviceFormats: boolean;
  setUseDeviceFormats: (enabled: boolean) => void;
  launchTab: LaunchTab;
  setLaunchTab: (launchTab: LaunchTab) => void;
  appLockEnabled: boolean;
  setAppLockEnabled: (enabled: boolean) => void;
  formatConfig: FormatConfig;
  isHydrated: boolean;
}

const AppPreferencesContext = createContext<AppPreferencesContextValue | null>(
  null,
);

function resolveFormatConfig(input: {
  clockFormat: ClockFormat;
  useDeviceFormats: boolean;
}): FormatConfig {
  const locale = input.useDeviceFormats ? detectDeviceLocale() : "en-GB";
  return {
    locale,
    hour12: resolveHour12(input.clockFormat, locale),
  };
}

export function AppPreferencesProvider({ children }: { children: ReactNode }) {
  const [clockFormat, setClockFormatState] = useState<ClockFormat>("system");
  const [useDeviceFormats, setUseDeviceFormatsState] = useState(false);
  const [launchTab, setLaunchTabState] = useState<LaunchTab>("home");
  const [appLockEnabled, setAppLockEnabledState] = useState(false);
  const [isHydrated, setIsHydrated] = useState(false);
  const [formatConfig, setFormatConfigState] = useState<FormatConfig>(() =>
    resolveFormatConfig({ clockFormat: "system", useDeviceFormats: false }),
  );

  const applyFormatConfig = useCallback(
    (nextClockFormat: ClockFormat, nextUseDeviceFormats: boolean) => {
      const next = resolveFormatConfig({
        clockFormat: nextClockFormat,
        useDeviceFormats: nextUseDeviceFormats,
      });
      setFormatConfig(next);
      setFormatConfigState(next);
    },
    [],
  );

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const [
          storedClockFormat,
          storedUseDeviceFormats,
          storedLaunchTab,
          storedAppLockEnabled,
        ] = await Promise.all([
          AsyncStorage.getItem(CLOCK_FORMAT_KEY),
          AsyncStorage.getItem(DEVICE_FORMATS_KEY),
          AsyncStorage.getItem(LAUNCH_TAB_KEY),
          AsyncStorage.getItem(APP_LOCK_KEY),
        ]);

        if (cancelled) {
          return;
        }

        const nextClockFormat = parseClockFormat(storedClockFormat);
        const nextUseDeviceFormats = parseBooleanPref(storedUseDeviceFormats);
        setClockFormatState(nextClockFormat);
        setUseDeviceFormatsState(nextUseDeviceFormats);
        setLaunchTabState(parseLaunchTab(storedLaunchTab));
        setAppLockEnabledState(parseBooleanPref(storedAppLockEnabled));
        applyFormatConfig(nextClockFormat, nextUseDeviceFormats);
      } catch {
        // Fall back to defaults when storage is unavailable.
      } finally {
        if (!cancelled) {
          setIsHydrated(true);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [applyFormatConfig]);

  const setClockFormat = useCallback(
    (next: ClockFormat) => {
      setClockFormatState(next);
      applyFormatConfig(next, useDeviceFormats);
      AsyncStorage.setItem(CLOCK_FORMAT_KEY, next).catch(() => undefined);
    },
    [applyFormatConfig, useDeviceFormats],
  );

  const setUseDeviceFormats = useCallback(
    (enabled: boolean) => {
      setUseDeviceFormatsState(enabled);
      applyFormatConfig(clockFormat, enabled);
      AsyncStorage.setItem(
        DEVICE_FORMATS_KEY,
        enabled ? "true" : "false",
      ).catch(() => undefined);
    },
    [applyFormatConfig, clockFormat],
  );

  const setLaunchTab = useCallback((next: LaunchTab) => {
    setLaunchTabState(next);
    AsyncStorage.setItem(LAUNCH_TAB_KEY, next).catch(() => undefined);
  }, []);

  const setAppLockEnabled = useCallback((enabled: boolean) => {
    setAppLockEnabledState(enabled);
    AsyncStorage.setItem(APP_LOCK_KEY, enabled ? "true" : "false").catch(
      () => undefined,
    );
  }, []);

  const value = useMemo<AppPreferencesContextValue>(
    () => ({
      clockFormat,
      setClockFormat,
      useDeviceFormats,
      setUseDeviceFormats,
      launchTab,
      setLaunchTab,
      appLockEnabled,
      setAppLockEnabled,
      formatConfig,
      isHydrated,
    }),
    [
      clockFormat,
      setClockFormat,
      useDeviceFormats,
      setUseDeviceFormats,
      launchTab,
      setLaunchTab,
      appLockEnabled,
      setAppLockEnabled,
      formatConfig,
      isHydrated,
    ],
  );

  return (
    <AppPreferencesContext.Provider value={value}>
      {children}
    </AppPreferencesContext.Provider>
  );
}

export function useAppPreferences(): AppPreferencesContextValue {
  const context = useContext(AppPreferencesContext);

  if (!context) {
    throw new Error(
      "useAppPreferences must be used inside AppPreferencesProvider",
    );
  }

  return context;
}
