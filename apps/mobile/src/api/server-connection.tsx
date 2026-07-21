import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Crypto from "expo-crypto";
import * as Linking from "expo-linking";
import * as SecureStore from "expo-secure-store";
import * as WebBrowser from "expo-web-browser";
import {
  get as passkeyGet,
  isSupported as passkeysSupported,
} from "react-native-passkeys";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Platform } from "react-native";

import {
  classifyServer,
  parseMobileAuthCallback,
  type ServerKind,
} from "@/lib/auth-callback";

import {
  ApiError,
  createApiClient,
  MOBILE_SESSION_INVALID_CODE,
  normalizeServerUrl,
  type ApiClient,
} from "./client";

const SERVER_URL_KEY = "finhance.serverUrl";
const SERVER_MODE_KEY = "finhance.serverMode";
const MOBILE_TOKEN_KEY = "finhance.mobileToken";

export type ServerMode = "local" | "hosted";
export type HostedSignInProvider = "google" | "github";

export interface HostedSignInOptions {
  /**
   * When false, the ceremony only returns the fresh token without rebinding
   * the stored session. Used by re-authentication flows that must first check
   * the token belongs to the account currently signed in.
   */
  adoptSession?: boolean;
}

export interface HostedSessionCredentials {
  /** Short-lived bearer used for proxy requests. */
  token: string;
  /** Opaque rotated credential kept only in SecureStore. */
  refreshToken: string;
}

export interface ServerInspection {
  kind: ServerKind["kind"];
  normalizedUrl: string;
}

interface ServerConnectionContextValue {
  /** null while loading from storage, "" when not configured. */
  serverUrl: string | null;
  serverMode: ServerMode;
  /** Short-lived hosted access token; the paired refresh token stays private. */
  token: string | null;
  client: ApiClient | null;
  isHydrated: boolean;
  /** A hosted server is saved but its session token is missing/expired. */
  needsSignIn: boolean;
  inspectServer: (rawUrl: string) => Promise<ServerInspection>;
  saveLocalServer: (normalizedUrl: string) => Promise<void>;
  signInHosted: (
    normalizedUrl: string,
    provider?: HostedSignInProvider,
    options?: HostedSignInOptions,
  ) => Promise<HostedSessionCredentials>;
  /** Native passkey sign-in against a hosted deployment (no browser). */
  signInWithPasskey: (
    normalizedUrl: string,
    options?: HostedSignInOptions,
  ) => Promise<HostedSessionCredentials>;
  /** Persists a hosted session token and rebinds the app to it. */
  adoptHostedSession: (
    normalizedUrl: string,
    credentials: HostedSessionCredentials,
  ) => Promise<void>;
  /** Refreshes a rejected hosted access token once; used by direct web routes. */
  refreshHostedAccessToken: () => Promise<string | null>;
  /** Whether this device's platform supports passkeys. */
  passkeysSupported: boolean;
  clearServer: (options?: { serverSessionRevoked?: boolean }) => Promise<void>;
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

function bytesToHex(bytes: Uint8Array): string {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function isHostedSessionCredentials(
  value: unknown,
): value is HostedSessionCredentials {
  if (!value || typeof value !== "object") {
    return false;
  }

  const { token, refreshToken } = value as {
    token?: unknown;
    refreshToken?: unknown;
  };

  return (
    typeof token === "string" &&
    Boolean(token.trim()) &&
    typeof refreshToken === "string" &&
    Boolean(refreshToken.trim())
  );
}

async function readStoredCredentials(): Promise<HostedSessionCredentials | null> {
  try {
    const stored = await SecureStore.getItemAsync(MOBILE_TOKEN_KEY);
    if (!stored) {
      return null;
    }

    try {
      const parsed: unknown = JSON.parse(stored);
      return isHostedSessionCredentials(parsed) ? parsed : null;
    } catch {
      // Legacy long-lived tokens cannot satisfy the new session binding. They
      // are deliberately treated as signed out rather than silently reused.
      return null;
    }
  } catch {
    return null;
  }
}

async function writeStoredCredentials(
  credentials: HostedSessionCredentials | null,
): Promise<void> {
  try {
    if (credentials) {
      await SecureStore.setItemAsync(
        MOBILE_TOKEN_KEY,
        JSON.stringify(credentials),
      );
    } else {
      await SecureStore.deleteItemAsync(MOBILE_TOKEN_KEY);
    }
  } catch {
    throw new ApiError(
      "Secure storage is unavailable, so this device cannot safely keep you signed in.",
      { isNetworkError: false },
    );
  }
}

function mobileDeviceLabel(): string {
  if (Platform.OS === "ios") {
    return "iOS device";
  }

  if (Platform.OS === "android") {
    return "Android device";
  }

  return "Mobile device";
}

export function ServerConnectionProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [serverUrl, setServerUrl] = useState<string | null>(null);
  const [serverMode, setServerMode] = useState<ServerMode>("local");
  const [token, setToken] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState<string | null>(null);
  const refreshInFlight = useRef<Promise<string | null> | null>(null);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const [storedUrl, storedMode, storedCredentials] = await Promise.all([
          AsyncStorage.getItem(SERVER_URL_KEY),
          AsyncStorage.getItem(SERVER_MODE_KEY),
          readStoredCredentials(),
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

          setServerMode(defaultMode);
          setToken(defaultToken);
          setRefreshToken(null);
          setServerUrl(defaultUrl);
          return;
        }

        setServerMode(storedMode === "hosted" ? "hosted" : "local");
        setToken(storedCredentials?.token ?? null);
        setRefreshToken(storedCredentials?.refreshToken ?? null);
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
    await writeStoredCredentials(null);
    await AsyncStorage.setItem(SERVER_URL_KEY, normalizedUrl);
    await AsyncStorage.setItem(SERVER_MODE_KEY, "local");
    setServerMode("local");
    setToken(null);
    setRefreshToken(null);
    setServerUrl(normalizedUrl);
  }, []);

  const adoptHostedSession = useCallback(
    async (normalizedUrl: string, credentials: HostedSessionCredentials) => {
      await writeStoredCredentials(credentials);
      await AsyncStorage.setItem(SERVER_URL_KEY, normalizedUrl);
      await AsyncStorage.setItem(SERVER_MODE_KEY, "hosted");
      setServerMode("hosted");
      setToken(credentials.token);
      setRefreshToken(credentials.refreshToken);
      setServerUrl(normalizedUrl);
    },
    [],
  );

  const forgetInvalidHostedSession = useCallback(() => {
    void (async () => {
      try {
        await writeStoredCredentials(null);
      } catch {
        // The server already rejected the session, so keep the app safe by
        // clearing its in-memory credentials even if keychain cleanup fails.
      }
      setToken(null);
      setRefreshToken(null);
    })();
  }, []);

  const refreshHostedAccessToken = useCallback(async (): Promise<
    string | null
  > => {
    if (!serverUrl || serverMode !== "hosted" || !refreshToken) {
      return null;
    }

    if (refreshInFlight.current) {
      return refreshInFlight.current;
    }

    const requestRefresh = async () => {
      try {
        const refreshClient = createApiClient(serverUrl);
        const credentials =
          await refreshClient.request<HostedSessionCredentials>(
            "/api/mobile/refresh",
            {
              method: "POST",
              body: { refreshToken },
            },
          );

        if (!isHostedSessionCredentials(credentials)) {
          throw new ApiError("The server returned an invalid mobile session.");
        }

        await writeStoredCredentials(credentials);
        setToken(credentials.token);
        setRefreshToken(credentials.refreshToken);
        return credentials.token;
      } catch (error) {
        if (
          error instanceof ApiError &&
          error.code === MOBILE_SESSION_INVALID_CODE
        ) {
          forgetInvalidHostedSession();
        }
        return null;
      }
    };

    const pending = requestRefresh();
    refreshInFlight.current = pending;

    try {
      return await pending;
    } finally {
      refreshInFlight.current = null;
    }
  }, [forgetInvalidHostedSession, refreshToken, serverMode, serverUrl]);

  const signInHosted = useCallback(
    async (
      normalizedUrl: string,
      provider?: HostedSignInProvider,
      options?: HostedSignInOptions,
    ) => {
      // The session token rides on every request; never send it in the clear.
      if (!normalizedUrl.startsWith("https://") && !__DEV__) {
        throw new ApiError(
          "Hosted sign-in needs an https:// server URL so your session is never sent unencrypted.",
        );
      }

      // PKCE: the browser handoff only ever carries a short-lived code bound to
      // this challenge; the verifier below never leaves the app.
      const verifier = bytesToHex(Crypto.getRandomBytes(32));
      const challenge = await Crypto.digestStringAsync(
        Crypto.CryptoDigestAlgorithm.SHA256,
        verifier,
      );

      const redirectUri = Linking.createURL("auth");
      const authorizeUrl = new URL(`${normalizedUrl}/api/mobile/authorize`);
      authorizeUrl.searchParams.set("redirect", redirectUri);
      authorizeUrl.searchParams.set("challenge", challenge.toLowerCase());
      if (provider) {
        authorizeUrl.searchParams.set("provider", provider);
      }

      const result = await WebBrowser.openAuthSessionAsync(
        authorizeUrl.toString(),
        redirectUri,
      );

      if (result.type !== "success") {
        throw new ApiError("Sign-in was cancelled before it completed.");
      }

      const code = parseMobileAuthCallback(result.url);

      if (!code) {
        throw new ApiError(
          "The server did not return a sign-in code. Make sure the deployment includes mobile sign-in support.",
        );
      }

      const exchangeClient = createApiClient(normalizedUrl);
      const credentials =
        await exchangeClient.request<HostedSessionCredentials>(
          "/api/mobile/token",
          {
            method: "POST",
            body: { code, verifier },
            mobileDeviceLabel: mobileDeviceLabel(),
          },
        );

      if (!isHostedSessionCredentials(credentials)) {
        throw new ApiError(
          "The server did not return a session token. Make sure the deployment includes mobile sign-in support.",
        );
      }

      if (options?.adoptSession !== false) {
        await adoptHostedSession(normalizedUrl, credentials);
      }
      return credentials;
    },
    [adoptHostedSession],
  );

  const signInWithPasskey = useCallback(
    async (normalizedUrl: string, signInOptions?: HostedSignInOptions) => {
      if (!normalizedUrl.startsWith("https://") && !__DEV__) {
        throw new ApiError(
          "Passkey sign-in needs an https:// server URL so your session is never sent unencrypted.",
        );
      }

      let supported = false;
      try {
        supported = passkeysSupported();
      } catch {
        supported = false;
      }
      if (!supported) {
        throw new ApiError("This device does not support passkeys.");
      }

      // The web routes mint the challenge and the session token; the assertion is
      // produced by the platform authenticator (Face/Touch ID) and never leaves
      // the device except as a signed WebAuthn response.
      const client = createApiClient(normalizedUrl);
      const { options, challenge } = await client.request<{
        options: Parameters<typeof passkeyGet>[0];
        challenge: string;
      }>("/api/mobile/passkey/options", { method: "POST" });

      const assertion = await passkeyGet(options);
      if (!assertion) {
        throw new ApiError(
          "Passkey sign-in was cancelled before it completed.",
        );
      }

      const credentials = await client.request<HostedSessionCredentials>(
        "/api/mobile/passkey/verify",
        {
          method: "POST",
          body: { response: assertion, challenge },
          mobileDeviceLabel: mobileDeviceLabel(),
        },
      );

      if (!isHostedSessionCredentials(credentials)) {
        throw new ApiError(
          "The server did not return a session token. Make sure the deployment includes mobile passkey support.",
        );
      }

      if (signInOptions?.adoptSession !== false) {
        await adoptHostedSession(normalizedUrl, credentials);
      }
      return credentials;
    },
    [adoptHostedSession],
  );

  const clearServer = useCallback(
    async (options?: { serverSessionRevoked?: boolean }) => {
      let storageError: unknown = null;

      try {
        await writeStoredCredentials(null);
      } catch (error) {
        if (!options?.serverSessionRevoked) {
          throw error;
        }
        storageError = error;
      }

      await AsyncStorage.removeItem(SERVER_URL_KEY);
      await AsyncStorage.removeItem(SERVER_MODE_KEY);
      setServerMode("local");
      setToken(null);
      setRefreshToken(null);
      setServerUrl("");

      if (storageError) {
        throw storageError;
      }
    },
    [],
  );

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
              ? { authToken: token, onUnauthorized: refreshHostedAccessToken }
              : {},
          )
        : null,
      isHydrated: serverUrl !== null,
      needsSignIn: Boolean(serverUrl && serverMode === "hosted" && !token),
      inspectServer,
      saveLocalServer,
      signInHosted,
      signInWithPasskey,
      adoptHostedSession,
      refreshHostedAccessToken,
      passkeysSupported: (() => {
        try {
          return passkeysSupported();
        } catch {
          return false;
        }
      })(),
      clearServer,
    };
  }, [
    serverUrl,
    serverMode,
    token,
    refreshHostedAccessToken,
    inspectServer,
    saveLocalServer,
    signInHosted,
    signInWithPasskey,
    adoptHostedSession,
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
