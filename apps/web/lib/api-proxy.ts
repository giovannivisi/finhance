function hasRequestBody(method: string): boolean {
  return method !== "GET" && method !== "HEAD";
}

export function stripForwardedHeaders(
  headers: Headers,
  options?: { stripBrowserContext?: boolean },
): Headers {
  const forwardedHeaders = new Headers(headers);

  forwardedHeaders.delete("accept-encoding");
  forwardedHeaders.delete("authorization");
  forwardedHeaders.delete("connection");
  forwardedHeaders.delete("content-length");
  forwardedHeaders.delete("cookie");
  forwardedHeaders.delete("host");
  forwardedHeaders.delete("x-forwarded-for");
  forwardedHeaders.delete("x-forwarded-host");
  forwardedHeaders.delete("x-forwarded-port");
  forwardedHeaders.delete("x-forwarded-proto");

  if (options?.stripBrowserContext) {
    forwardedHeaders.delete("origin");
    forwardedHeaders.delete("referer");
  }

  return forwardedHeaders;
}

export async function buildUpstreamRequest(request: Request): Promise<{
  body: BodyInit | undefined;
  duplex?: "half";
}> {
  if (!hasRequestBody(request.method) || !request.body) {
    return { body: undefined };
  }

  return {
    body: request.body,
    duplex: "half",
  };
}

export async function toUpstreamResponse(
  response: Response,
): Promise<Response> {
  const headers = new Headers(response.headers);
  headers.set("cache-control", "no-store, no-transform");
  headers.delete("content-encoding");
  headers.delete("content-length");
  headers.set("content-encoding", "identity");
  headers.delete("etag");
  headers.delete("transfer-encoding");
  headers.delete("set-cookie");
  headers.set("x-finhance-proxy", "streamed-identity-v3");

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
