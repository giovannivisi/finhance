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

import {
  ApiError,
  createApiClient,
  normalizeServerUrl,
  type ApiClient,
} from "./client";
import { api, type HealthStatusResponse } from "./endpoints";

const SERVER_URL_KEY = "finhance.serverUrl";

interface ServerConnectionContextValue {
  /** null while loading from storage, "" when not configured. */
  serverUrl: string | null;
  client: ApiClient | null;
  isHydrated: boolean;
  testServer: (rawUrl: string) => Promise<HealthStatusResponse>;
  saveServer: (rawUrl: string) => Promise<void>;
  clearServer: () => Promise<void>;
}

const ServerConnectionContext =
  createContext<ServerConnectionContextValue | null>(null);

export function ServerConnectionProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [serverUrl, setServerUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    AsyncStorage.getItem(SERVER_URL_KEY)
      .then((stored) => {
        if (cancelled) {
          return;
        }

        // Developer convenience: pre-connect simulators/dev builds to a known
        // server (e.g. the mock API) without typing the URL each install.
        const defaultUrl = normalizeServerUrl(
          process.env.EXPO_PUBLIC_DEFAULT_SERVER_URL ?? "",
        );

        if (!stored && defaultUrl && __DEV__) {
          AsyncStorage.setItem(SERVER_URL_KEY, defaultUrl).catch(
            () => undefined,
          );
          setServerUrl(defaultUrl);
          return;
        }

        setServerUrl(stored ?? "");
      })
      .catch(() => {
        if (!cancelled) {
          setServerUrl("");
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const testServer = useCallback(async (rawUrl: string) => {
    const normalized = normalizeServerUrl(rawUrl);

    if (!normalized) {
      throw new ApiError(
        "Enter a valid server URL, e.g. http://192.168.1.10:3000",
      );
    }

    const health = await api.health(createApiClient(normalized));

    if (health?.status !== "ok" || health?.service !== "api") {
      throw new ApiError(
        "That URL responded, but it does not look like a finhance API. Make sure it points at the API, not the web app.",
      );
    }

    if (health.authMode === "hosted") {
      throw new ApiError(
        "This server runs in hosted auth mode, which the mobile app cannot sign in to yet. Point the app at a self-hosted API in local mode.",
      );
    }

    return health;
  }, []);

  const saveServer = useCallback(
    async (rawUrl: string) => {
      const normalized = normalizeServerUrl(rawUrl);

      if (!normalized) {
        throw new ApiError("Enter a valid server URL.");
      }

      await testServer(normalized);
      await AsyncStorage.setItem(SERVER_URL_KEY, normalized);
      setServerUrl(normalized);
    },
    [testServer],
  );

  const clearServer = useCallback(async () => {
    await AsyncStorage.removeItem(SERVER_URL_KEY);
    setServerUrl("");
  }, []);

  const value = useMemo<ServerConnectionContextValue>(
    () => ({
      serverUrl,
      client: serverUrl ? createApiClient(serverUrl) : null,
      isHydrated: serverUrl !== null,
      testServer,
      saveServer,
      clearServer,
    }),
    [serverUrl, testServer, saveServer, clearServer],
  );

  return (
    <ServerConnectionContext.Provider value={value}>
      {children}
    </ServerConnectionContext.Provider>
  );
}

export function useServerConnection(): ServerConnectionContextValue {
  const context = useContext(ServerConnectionContext);

  if (!context) {
    throw new Error(
      "useServerConnection must be used inside ServerConnectionProvider",
    );
  }

  return context;
}

/**
 * Returns a connected API client. Screens behind the connection gate can rely
 * on this without re-checking configuration state.
 */
export function useApiClient(): ApiClient {
  const { client } = useServerConnection();

  if (!client) {
    throw new Error("API client requested before a server was configured.");
  }

  return client;
}
