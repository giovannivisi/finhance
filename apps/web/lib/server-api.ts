import "server-only";

import { auth } from "@lib/auth";
import { getDirectApiUrl, mintApiAccessToken } from "@lib/api-auth";
import { readApiError, withDefaultHeaders } from "@lib/api-core";
import { isHostedAuthMode } from "@lib/auth-mode";

export async function fetchServerApi(
  path: string,
  options?: RequestInit,
  fetchImpl: typeof fetch = fetch,
): Promise<Response> {
  const headers = withDefaultHeaders(options, false);

  if (isHostedAuthMode()) {
    const session = await auth();
    const userId = session?.user?.id;

    if (!userId) {
      throw new Error("Authentication is required.");
    }

    headers.set(
      "Authorization",
      `Bearer ${await mintApiAccessToken({
        userId,
        email: session.user?.email ?? null,
      })}`,
    );
  }

  return fetchImpl(getDirectApiUrl(path), {
    cache: "no-store",
    ...options,
    headers,
  });
}

export async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetchServerApi(path, options);

  if (!response.ok) {
    throw new Error(await readApiError(response));
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}
