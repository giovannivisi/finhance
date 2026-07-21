export class ApiError extends Error {
  readonly status: number | null;
  readonly isNetworkError: boolean;
  /** Machine-readable error code from the server, when one is provided. */
  readonly code: string | null;

  constructor(
    message: string,
    options: {
      status?: number | null;
      isNetworkError?: boolean;
      code?: string | null;
    } = {},
  ) {
    super(message);
    this.name = "ApiError";
    this.status = options.status ?? null;
    this.isNetworkError = options.isNetworkError ?? false;
    this.code = options.code ?? null;
  }
}

export const MOBILE_SESSION_INVALID_CODE = "MOBILE_SESSION_INVALID";

function extractErrorCode(payload: unknown): string | null {
  if (payload && typeof payload === "object" && "code" in payload) {
    const code = (payload as { code: unknown }).code;

    if (typeof code === "string" && code.trim()) {
      return code;
    }
  }

  return null;
}

export interface ApiClient {
  baseUrl: string;
  request: <T>(path: string, options?: RequestOptions) => Promise<T>;
}

export interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  query?: Record<string, string | number | boolean | undefined>;
  body?: unknown;
  idempotencyKey?: string;
  timeoutMs?: number;
  /** Non-identifying label recorded with a newly created mobile session. */
  mobileDeviceLabel?: string;
}

const DEFAULT_TIMEOUT_MS = 20_000;

export function normalizeServerUrl(raw: string): string | null {
  let candidate = raw.trim();

  if (!candidate) {
    return null;
  }

  if (!/^https?:\/\//i.test(candidate)) {
    if (candidate.includes("://")) {
      // A non-HTTP scheme was given explicitly; don't silently rewrite it.
      return null;
    }

    candidate = `http://${candidate}`;
  }

  try {
    const parsed = new URL(candidate);

    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }

    const pathname = parsed.pathname.replace(/\/+$/, "");
    return `${parsed.protocol}//${parsed.host}${pathname}`;
  } catch {
    return null;
  }
}

export function buildUrl(
  baseUrl: string,
  path: string,
  query?: RequestOptions["query"],
): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  let url = `${baseUrl}${normalizedPath}`;

  if (query) {
    const params = new URLSearchParams();

    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null && `${value}` !== "") {
        params.append(key, `${value}`);
      }
    }

    const search = params.toString();

    if (search) {
      url += `?${search}`;
    }
  }

  return url;
}

function extractErrorMessage(payload: unknown, status: number): string {
  if (payload && typeof payload === "object" && "message" in payload) {
    const message = (payload as { message: unknown }).message;

    if (typeof message === "string" && message.trim()) {
      return message;
    }

    if (Array.isArray(message) && message.length > 0) {
      return message.map((entry) => `${entry}`).join("\n");
    }
  }

  if (status === 401) {
    return "The server requires authentication.";
  }

  if (status === 404) {
    return "Not found.";
  }

  if (status >= 500) {
    return "The server hit an unexpected error.";
  }

  return `Request failed (${status}).`;
}

export function generateIdempotencyKey(): string {
  const cryptoApi = globalThis.crypto;

  if (cryptoApi && typeof cryptoApi.randomUUID === "function") {
    return cryptoApi.randomUUID();
  }

  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (char) => {
    const random = (Math.random() * 16) | 0;
    const value = char === "x" ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

export interface ApiClientOptions {
  /** Mobile session token for hosted servers; sent as a Bearer header. */
  authToken?: string | null;
  /**
   * Invoked once when the proxy rejects an access token. A refreshed token
   * retries the interrupted request; null leaves the original 401 intact.
   */
  onUnauthorized?: () => Promise<string | null> | string | null;
}

export function createApiClient(
  baseUrl: string,
  clientOptions: ApiClientOptions = {},
): ApiClient {
  let currentAuthToken = clientOptions.authToken ?? null;

  async function request<T>(
    path: string,
    options: RequestOptions = {},
    refreshedAuthToken?: string,
    hasRetriedAfterRefresh = false,
  ): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    );

    const headers: Record<string, string> = {
      Accept: "application/json",
    };

    const authToken = refreshedAuthToken ?? currentAuthToken;
    if (authToken) {
      headers.Authorization = `Bearer ${authToken}`;
    }

    if (options.body !== undefined) {
      headers["Content-Type"] = "application/json";
    }

    if (options.idempotencyKey) {
      headers["Idempotency-Key"] = options.idempotencyKey;
    }

    if (options.mobileDeviceLabel) {
      headers["X-Finhance-Device-Label"] = options.mobileDeviceLabel;
    }

    let response: Response;

    try {
      response = await fetch(buildUrl(baseUrl, path, options.query), {
        method: options.method ?? "GET",
        headers,
        body:
          options.body !== undefined ? JSON.stringify(options.body) : undefined,
        signal: controller.signal,
      });
    } catch (error) {
      const aborted =
        error instanceof Error &&
        (error.name === "AbortError" || controller.signal.aborted);
      throw new ApiError(
        aborted
          ? "The server took too long to respond."
          : "Could not reach the server. Check the URL and your network.",
        { isNetworkError: true },
      );
    } finally {
      clearTimeout(timeout);
    }

    if (response.status === 204) {
      return undefined as T;
    }

    const text = await response.text();
    let payload: unknown = null;

    if (text) {
      try {
        payload = JSON.parse(text);
      } catch {
        payload = null;
      }
    }

    if (!response.ok) {
      const code = extractErrorCode(payload);

      if (
        !hasRetriedAfterRefresh &&
        response.status === 401 &&
        code === MOBILE_SESSION_INVALID_CODE &&
        clientOptions.onUnauthorized
      ) {
        const nextToken = await clientOptions.onUnauthorized();

        if (nextToken) {
          currentAuthToken = nextToken;
          return request<T>(path, options, nextToken, true);
        }
      }

      throw new ApiError(extractErrorMessage(payload, response.status), {
        status: response.status,
        code,
      });
    }

    return payload as T;
  }

  return { baseUrl, request };
}
