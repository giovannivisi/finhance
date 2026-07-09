import * as LocalAuthentication from "expo-local-authentication";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { AppState, StyleSheet, View } from "react-native";

import { useAppPreferences } from "@/prefs";
import { spacing, useTheme } from "@/theme";

import { AppText, Button } from "./ui";

type LocalAuthAvailability = "available" | "unavailable" | "unknown";

async function localAuthAvailability(): Promise<LocalAuthAvailability> {
  try {
    const [hasHardware, isEnrolled] = await Promise.all([
      LocalAuthentication.hasHardwareAsync(),
      LocalAuthentication.isEnrolledAsync(),
    ]);
    return hasHardware && isEnrolled ? "available" : "unavailable";
  } catch {
    return "unknown";
  }
}

export function AppLockGate({ children }: { children: ReactNode }) {
  const { appLockEnabled } = useAppPreferences();
  const { colors } = useTheme();
  const [locked, setLocked] = useState(appLockEnabled);
  const [checking, setChecking] = useState(false);
  const authenticatingRef = useRef(false);

  const unlock = useCallback(async () => {
    if (!appLockEnabled || authenticatingRef.current) {
      return;
    }

    authenticatingRef.current = true;
    setChecking(true);

    try {
      // Fail open only when biometrics are confirmed unavailable: removing
      // enrolment requires the device passcode, which already passes the
      // authentication fallback below. Unknown errors keep the lock in place;
      // the overlay's Unlock button remains the retry path.
      if ((await localAuthAvailability()) === "unavailable") {
        setLocked(false);
        return;
      }

      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: "Unlock finhance",
        fallbackLabel: "Use passcode",
        disableDeviceFallback: false,
      });

      if (result.success) {
        setLocked(false);
      }
    } catch {
      // Fail closed: an unexpected authentication error keeps the app locked.
    } finally {
      authenticatingRef.current = false;
      setChecking(false);
    }
  }, [appLockEnabled]);

  useEffect(() => {
    if (!appLockEnabled) {
      setLocked(false);
      return;
    }

    setLocked(true);
    void unlock();
  }, [appLockEnabled, unlock]);

  useEffect(() => {
    if (!appLockEnabled) {
      return undefined;
    }

    const subscription = AppState.addEventListener("change", (status) => {
      if (status === "inactive" || status === "background") {
        setLocked(true);
        return;
      }

      if (status === "active") {
        void unlock();
      }
    });

    return () => subscription.remove();
  }, [appLockEnabled, unlock]);

  return (
    <View style={{ flex: 1 }}>
      {children}
      {appLockEnabled && locked ? (
        <View
          style={[
            StyleSheet.absoluteFill,
            styles.overlay,
            { backgroundColor: colors.bgApp },
          ]}
        >
          <View style={{ gap: spacing.md, alignItems: "center" }}>
            <AppText variant="title2">finhance is locked</AppText>
            <AppText variant="footnote" tone="secondary">
              Unlock to view your workspace.
            </AppText>
            <Button
              label="Unlock"
              onPress={() => void unlock()}
              loading={checking}
            />
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xl,
    zIndex: 1000,
  },
});
