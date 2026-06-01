import "server-only";

import { cache } from "react";
import { auth } from "@lib/auth";
import { getDirectApiUrl, mintApiAccessToken } from "@lib/api-auth";
import {
  readApiError,
  readApiResponseBody,
  withDefaultHeaders,
} from "@lib/api-core";
import { isHostedAuthMode } from "@lib/auth-mode";
import { resolveProxyAuthorization } from "@lib/proxy-auth";

const getServerAuthorizationHeader = cache(async (): Promise<string | null> => {
  if (!isHostedAuthMode()) {
    return null;
  }

  const session = await auth();
  const authorization = await resolveProxyAuthorization({
    hostedAuthMode: true,
    sessionUser: session?.user,
    mintToken: mintApiAccessToken,
  });

  if (!authorization.ok) {
    throw new Error("Authentication is required.");
  }

  return authorization.authorizationHeader;
});

export async function fetchServerApi(
  path: string,
  options?: RequestInit,
  fetchImpl: typeof fetch = fetch,
): Promise<Response> {
  const headers = withDefaultHeaders(options, false);

  const authorizationHeader = await getServerAuthorizationHeader();
  if (authorizationHeader) {
    headers.set("Authorization", authorizationHeader);
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

  return readApiResponseBody<T>(response);
}
