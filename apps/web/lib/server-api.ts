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
import {
  getServerApiCacheUserKey,
  isCacheableServerApiRequest,
  readThroughServerApiCache,
} from "@lib/server-api-cache";

type ServerApiActor = {
  authorizationHeader: string | null;
  userKey: string | null;
};

const getServerApiActor = cache(async (): Promise<ServerApiActor> => {
  const hostedAuthMode = isHostedAuthMode();

  if (!hostedAuthMode) {
    return {
      authorizationHeader: null,
      userKey: getServerApiCacheUserKey({ hostedAuthMode }),
    };
  }

  const session = await auth();
  const userId = session?.user?.id?.trim();
  const authorization = await resolveProxyAuthorization({
    hostedAuthMode: true,
    sessionUser: session?.user,
    mintToken: mintApiAccessToken,
  });

  if (!authorization.ok) {
    throw new Error("Authentication is required.");
  }

  return {
    authorizationHeader: authorization.authorizationHeader,
    userKey: getServerApiCacheUserKey({ hostedAuthMode, userId }),
  };
});

export async function fetchServerApi(
  path: string,
  options?: RequestInit,
  fetchImpl: typeof fetch = fetch,
): Promise<Response> {
  const headers = withDefaultHeaders(options, false);

  const { authorizationHeader } = await getServerApiActor();
  if (authorizationHeader) {
    headers.set("Authorization", authorizationHeader);
  }

  return fetchImpl(getDirectApiUrl(path), {
    cache: "no-store",
    ...options,
    headers,
  });
}

async function uncachedApi<T>(
  path: string,
  options?: RequestInit,
): Promise<T> {
  const response = await fetchServerApi(path, options);

  if (!response.ok) {
    throw new Error(await readApiError(response));
  }

  return readApiResponseBody<T>(response);
}

export async function api<T>(path: string, options?: RequestInit): Promise<T> {
  if (!isCacheableServerApiRequest(options)) {
    return uncachedApi<T>(path, options);
  }

  const { userKey } = await getServerApiActor();

  return readThroughServerApiCache<T>({
    userKey,
    path,
    load: () => uncachedApi<T>(path, options),
  });
}
