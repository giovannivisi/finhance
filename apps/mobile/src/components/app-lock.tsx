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

async function canUseLocalAuthentication(): Promise<boolean> {
  try {
    const [hasHardware, isEnrolled] = await Promise.all([
      LocalAuthentication.hasHardwareAsync(),
      LocalAuthentication.isEnrolledAsync(),
    ]);
    return hasHardware && isEnrolled;
  } catch {
    return false;
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
      if (!(await canUseLocalAuthentication())) {
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
      setLocked(false);
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
