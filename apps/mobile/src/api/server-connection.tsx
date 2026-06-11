import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Linking from "expo-linking";
import * as SecureStore from "expo-secure-store";
import * as WebBrowser from "expo-web-browser";
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
  classifyServer,
  parseMobileAuthCallback,
  type ServerKind,
} from "@/lib/auth-callback";

import {
  ApiError,
  createApiClient,
  normalizeServerUrl,
  type ApiClient,
} from "./client";

const SERVER_URL_KEY = "finhance.serverUrl";
const SERVER_MODE_KEY = "finhance.serverMode";
const MOBILE_TOKEN_KEY = "finhance.mobileToken";

export type ServerMode = "local" | "hosted";

export interface ServerInspection {
  kind: ServerKind["kind"];
  normalizedUrl: string;
}

interface ServerConnectionContextValue {
  /** null while loading from storage, "" when not configured. */
  serverUrl: string | null;
  serverMode: ServerMode;
  /** Hosted-mode mobile session token (kept in the keychain). */
  token: string | null;
  client: ApiClient | null;
  isHydrated: boolean;
  /** A hosted server is saved but its session token is missing/expired. */
  needsSignIn: boolean;
  inspectServer: (rawUrl: string) => Promise<ServerInspection>;
  saveLocalServer: (normalizedUrl: string) => Promise<void>;
  signInHosted: (normalizedUrl: string) => Promise<void>;
  clearServer: () => Promise<void>;
}

const ServerConnectionContext =
  createContext<ServerConnectionContextValue | null>(null);

async function fetchHealth(
  url: string,
): Promise<{ service?: string; authMode?: string } | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const response = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });

    if (!response.ok) {
      return null;
    }

    const payload: unknown = await response.json();

    if (payload && typeof payload === "object") {
      return payload as { service?: string; authMode?: string };
    }

    return null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function readStoredToken(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(MOBILE_TOKEN_KEY);
  } catch {
    return null;
  }
}

async function writeStoredToken(token: string | null): Promise<void> {
  try {
    if (token) {
      await SecureStore.setItemAsync(MOBILE_TOKEN_KEY, token);
    } else {
      await SecureStore.deleteItemAsync(MOBILE_TOKEN_KEY);
    }
  } catch {
    // Keychain unavailability should never crash the app.
  }
}

export function ServerConnectionProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [serverUrl, setServerUrl] = useState<string | null>(null);
  const [serverMode, setServerMode] = useState<ServerMode>("local");
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const [storedUrl, storedMode, storedToken] = await Promise.all([
          AsyncStorage.getItem(SERVER_URL_KEY),
          AsyncStorage.getItem(SERVER_MODE_KEY),
          readStoredToken(),
        ]);

        if (cancelled) {
          return;
        }

        // Developer convenience: pre-connect simulators/dev builds to a known
        // server (e.g. the mock API) without typing the URL each install.
        const defaultUrl = normalizeServerUrl(
          process.env.EXPO_PUBLIC_DEFAULT_SERVER_URL ?? "",
        );

        if (!storedUrl && defaultUrl && __DEV__) {
          const defaultMode: ServerMode =
            process.env.EXPO_PUBLIC_DEFAULT_SERVER_MODE === "hosted"
              ? "hosted"
              : "local";
          const defaultToken =
            process.env.EXPO_PUBLIC_DEFAULT_SERVER_TOKEN?.trim() || null;

          AsyncStorage.setItem(SERVER_URL_KEY, defaultUrl).catch(
            () => undefined,
          );
          AsyncStorage.setItem(SERVER_MODE_KEY, defaultMode).catch(
            () => undefined,
          );

          if (defaultToken) {
            void writeStoredToken(defaultToken);
          }

          setServerMode(defaultMode);
          setToken(defaultToken);
          setServerUrl(defaultUrl);
          return;
        }

        setServerMode(storedMode === "hosted" ? "hosted" : "local");
        setToken(storedToken);
        setServerUrl(storedUrl ?? "");
      } catch {
        if (!cancelled) {
          setServerUrl("");
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const inspectServer = useCallback(
    async (rawUrl: string): Promise<ServerInspection> => {
      const normalized = normalizeServerUrl(rawUrl);

      if (!normalized) {
        throw new ApiError(
          "Enter a valid server URL, e.g. https://finhance-web.vercel.app or http://192.168.1.10:3000",
        );
      }

      const apiHealth = await fetchHealth(`${normalized}/health`);
      const webHealth =
        apiHealth?.service === "api"
          ? null
          : await fetchHealth(`${normalized}/api/mobile/health`);

      const { kind } = classifyServer(apiHealth, webHealth);

      if (kind === "unknown") {
        throw new ApiError(
          "That URL does not look like a finhance server. Enter the web app address for hosted setups, or the API address for self-hosted ones.",
        );
      }

      return { kind, normalizedUrl: normalized };
    },
    [],
  );

  const saveLocalServer = useCallback(async (normalizedUrl: string) => {
    await AsyncStorage.setItem(SERVER_URL_KEY, normalizedUrl);
    await AsyncStorage.setItem(SERVER_MODE_KEY, "local");
    await writeStoredToken(null);
    setServerMode("local");
    setToken(null);
    setServerUrl(normalizedUrl);
  }, []);

  const signInHosted = useCallback(async (normalizedUrl: string) => {
    const redirectUri = Linking.createURL("auth");
    const authorizeUrl = `${normalizedUrl}/api/mobile/authorize?redirect=${encodeURIComponent(
      redirectUri,
    )}`;

    const result = await WebBrowser.openAuthSessionAsync(
      authorizeUrl,
      redirectUri,
    );

    if (result.type !== "success") {
      throw new ApiError("Sign-in was cancelled before it completed.");
    }

    const nextToken = parseMobileAuthCallback(result.url);

    if (!nextToken) {
      throw new ApiError(
        "The server did not return a session token. Make sure the deployment includes mobile sign-in support.",
      );
    }

    await AsyncStorage.setItem(SERVER_URL_KEY, normalizedUrl);
    await AsyncStorage.setItem(SERVER_MODE_KEY, "hosted");
    await writeStoredToken(nextToken);
    setServerMode("hosted");
    setToken(nextToken);
    setServerUrl(normalizedUrl);
  }, []);

  const clearServer = useCallback(async () => {
    await AsyncStorage.removeItem(SERVER_URL_KEY);
    await AsyncStorage.removeItem(SERVER_MODE_KEY);
    await writeStoredToken(null);
    setServerMode("local");
    setToken(null);
    setServerUrl("");
  }, []);

  const dropToken = useCallback(() => {
    void writeStoredToken(null);
    setToken(null);
  }, []);

  const value = useMemo<ServerConnectionContextValue>(() => {
    const connected = Boolean(serverUrl && (serverMode === "local" || token));

    return {
      serverUrl,
      serverMode,
      token,
      client: connected
        ? createApiClient(
            serverMode === "hosted"
              ? `${serverUrl}/api/proxy`
              : (serverUrl as string),
            serverMode === "hosted"
              ? { authToken: token, onUnauthorized: dropToken }
              : {},
          )
        : null,
      isHydrated: serverUrl !== null,
      needsSignIn: Boolean(serverUrl && serverMode === "hosted" && !token),
      inspectServer,
      saveLocalServer,
      signInHosted,
      clearServer,
    };
  }, [
    serverUrl,
    serverMode,
    token,
    dropToken,
    inspectServer,
    saveLocalServer,
    signInHosted,
    clearServer,
  ]);

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
