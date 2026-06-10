import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from "@expo-google-fonts/inter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import * as SplashScreen from "expo-splash-screen";
import * as SystemUI from "expo-system-ui";
import { useEffect, useMemo } from "react";
import { View } from "react-native";

import { ApiError } from "@/api/client";
import {
  ServerConnectionProvider,
  useServerConnection,
} from "@/api/server-connection";
import { ThemeProvider, useTheme } from "@/theme";

SplashScreen.preventAutoHideAsync().catch(() => undefined);

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
  const { colors, scheme } = useTheme();
  const { serverUrl, isHydrated } = useServerConnection();

  const queryClient = useMemo(
    () => createQueryClient(),
    // A new cache per server keeps data from leaking across connections.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [serverUrl],
  );

  useEffect(() => {
    SystemUI.setBackgroundColorAsync(colors.bgApp).catch(() => undefined);
  }, [colors.bgApp]);

  useEffect(() => {
    if (isHydrated) {
      SplashScreen.hideAsync().catch(() => undefined);
    }
  }, [isHydrated]);

  // Keep the splash up until we know whether a server is configured; screens
  // assume a connected API client once they mount.
  if (!isHydrated) {
    return null;
  }

  const connected = Boolean(serverUrl);

  return (
    <QueryClientProvider client={queryClient}>
      <View style={{ flex: 1, backgroundColor: colors.bgApp }}>
        <StatusBar style={scheme === "dark" ? "light" : "dark"} />
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
            <Stack.Screen name="connect" options={{ gestureEnabled: false }} />
          </Stack.Protected>
        </Stack>
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
      <ServerConnectionProvider>
        <ThemedApp />
      </ServerConnectionProvider>
    </ThemeProvider>
  );
}
