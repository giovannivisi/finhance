import { readApiError, withDefaultHeaders } from "./api-core.ts";

const API_PROXY_PREFIX = "/api/proxy";

function normalizeApiPath(path: string): string {
  if (!path.startsWith("/")) {
    return `/${path}`;
  }

  return path;
}

export function getApiUrl(path: string): string {
  return `${API_PROXY_PREFIX}${normalizeApiPath(path)}`;
}

export async function fetchApi(
  path: string,
  options?: RequestInit,
  fetchImpl: typeof fetch = fetch,
): Promise<Response> {
  const headers = withDefaultHeaders(options, false);

  return fetchImpl(getApiUrl(path), {
    cache: "no-store",
    ...options,
    headers,
  });
}

export async function fetchApiMutation(
  path: string,
  options?: RequestInit,
  fetchImpl: typeof fetch = fetch,
): Promise<Response> {
  const headers = withDefaultHeaders(options, true);

  return fetchImpl(getApiUrl(path), {
    cache: "no-store",
    ...options,
    headers,
  });
}

export async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetchApi(path, options);

  if (!response.ok) {
    throw new Error(await readApiError(response));
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

export async function apiMutation<T>(
  path: string,
  options?: RequestInit,
): Promise<T> {
  const response = await fetchApiMutation(path, options);

  if (!response.ok) {
    throw new Error(await readApiError(response));
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

export { readApiError } from "./api-core.ts";
