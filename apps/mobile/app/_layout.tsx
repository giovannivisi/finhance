import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from "@expo-google-fonts/inter";
import {
  focusManager,
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import * as SplashScreen from "expo-splash-screen";
import * as SystemUI from "expo-system-ui";
import { useCallback, useEffect, useMemo } from "react";
import { AppState, Platform, View } from "react-native";

import { ApiError } from "@/api/client";
import {
  ServerConnectionProvider,
  useServerConnection,
} from "@/api/server-connection";
import { AppLockGate } from "@/components/app-lock";
import { AppPreferencesProvider, useAppPreferences } from "@/prefs";
import { AppLockProvider, useAppLock } from "@/security";
import { ThemeProvider, useTheme } from "@/theme";

SplashScreen.preventAutoHideAsync().catch(() => undefined);
SplashScreen.setOptions({ duration: 160, fade: true });

// React Query cannot see native app focus by itself; bridge AppState so data
// refetches when the app returns to the foreground.
if (Platform.OS !== "web") {
  AppState.addEventListener("change", (status) => {
    focusManager.setFocused(status === "active");
  });
}

function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        retry: (failureCount, error) => {
          if (error instanceof ApiError && error.status !== null) {
            return false;
          }
          return failureCount < 2;
        },
      },
    },
  });
}

function ThemedApp() {
  const { colors, scheme, isHydrated: themeHydrated } = useTheme();
  const { isHydrated: preferencesHydrated } = useAppPreferences();
  const { isHydrated: appLockHydrated } = useAppLock();
  const {
    serverUrl,
    serverMode,
    token,
    isHydrated: serverHydrated,
  } = useServerConnection();

  const queryClient = useMemo(
    () => createQueryClient(),
    // A new cache per server/session keeps data from leaking across users.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [serverUrl, serverMode, token],
  );
  const hideNativeSplash = useCallback(() => {
    SplashScreen.hideAsync().catch(() => undefined);
  }, []);

  useEffect(() => {
    SystemUI.setBackgroundColorAsync(colors.bgApp).catch(() => undefined);
  }, [colors.bgApp]);

  // Keep the splash up until we know whether a server is configured; screens
  // assume a connected API client once they mount.
  if (
    !themeHydrated ||
    !preferencesHydrated ||
    !appLockHydrated ||
    !serverHydrated
  ) {
    return null;
  }

  // Hosted servers also need a signed-in mobile session before the data
  // screens may mount.
  const connected = Boolean(serverUrl && (serverMode === "local" || token));

  return (
    <QueryClientProvider client={queryClient}>
      <View style={{ flex: 1, backgroundColor: colors.bgApp }}>
        <StatusBar style={scheme === "dark" ? "light" : "dark"} />
        <AppLockGate onReady={hideNativeSplash}>
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: colors.bgApp },
            }}
          >
            <Stack.Protected guard={connected}>
              <Stack.Screen name="(tabs)" />
              <Stack.Screen
                name="transactions/upsert"
                options={{ presentation: "modal" }}
              />
              <Stack.Screen
                name="accounts/upsert"
                options={{ presentation: "modal" }}
              />
              <Stack.Screen
                name="holdings/upsert"
                options={{ presentation: "modal" }}
              />
              <Stack.Screen
                name="budgets/upsert"
                options={{ presentation: "modal" }}
              />
              <Stack.Screen
                name="recurring/upsert"
                options={{ presentation: "modal" }}
              />
              <Stack.Screen
                name="categories/upsert"
                options={{ presentation: "modal" }}
              />
            </Stack.Protected>
            <Stack.Protected guard={!connected}>
              <Stack.Screen name="login" options={{ gestureEnabled: false }} />
              <Stack.Screen name="signup" options={{ gestureEnabled: false }} />
              <Stack.Screen
                name="account-deleted"
                options={{ gestureEnabled: false }}
              />
            </Stack.Protected>
          </Stack>
        </AppLockGate>
      </View>
    </QueryClientProvider>
  );
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  if (!fontsLoaded) {
    return null;
  }

  return (
    <ThemeProvider>
      <AppPreferencesProvider>
        <ServerConnectionProvider>
          <AppLockProvider>
            <ThemedApp />
          </AppLockProvider>
        </ServerConnectionProvider>
      </AppPreferencesProvider>
    </ThemeProvider>
  );
}
