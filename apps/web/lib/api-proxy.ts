function hasRequestBody(method: string): boolean {
  return method !== "GET" && method !== "HEAD";
}

function isMultipartFormDataRequest(request: Request): boolean {
  const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
  return contentType.includes("multipart/form-data");
}

export function stripForwardedHeaders(headers: Headers): Headers {
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

  return forwardedHeaders;
}

export async function buildUpstreamRequest(
  request: Request,
  headers: Headers,
): Promise<{
  body: BodyInit | undefined;
  duplex?: "half";
}> {
  if (!hasRequestBody(request.method)) {
    return { body: undefined };
  }

  if (isMultipartFormDataRequest(request)) {
    headers.delete("content-type");
    headers.delete("content-length");

    return {
      body: await request.formData(),
    };
  }

  return {
    body: request.body ?? undefined,
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
  headers.set("x-finhance-proxy", "buffered-identity-v2");

  const body =
    response.status === 204 || response.status === 304
      ? null
      : await response.arrayBuffer();

  return new Response(body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
