import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from "@expo-google-fonts/inter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import * as SplashScreen from "expo-splash-screen";
import * as SystemUI from "expo-system-ui";
import { useEffect, useMemo, type ReactNode } from "react";
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

/** Redirects to the connect screen until a server is configured. */
function ConnectionGate({ children }: { children: ReactNode }) {
  const { serverUrl, isHydrated } = useServerConnection();
  const segments = useSegments();
  const router = useRouter();

  const onConnectScreen = segments[0] === "connect";

  useEffect(() => {
    if (!isHydrated) {
      return;
    }

    if (!serverUrl && !onConnectScreen) {
      router.replace("/connect");
    } else if (serverUrl && onConnectScreen) {
      router.replace("/");
    }
  }, [isHydrated, serverUrl, onConnectScreen, router]);

  return <>{children}</>;
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

  return (
    <QueryClientProvider client={queryClient}>
      <ConnectionGate>
        <View style={{ flex: 1, backgroundColor: colors.bgApp }}>
          <StatusBar style={scheme === "dark" ? "light" : "dark"} />
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: colors.bgApp },
            }}
          >
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="connect" options={{ gestureEnabled: false }} />
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
          </Stack>
        </View>
      </ConnectionGate>
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
