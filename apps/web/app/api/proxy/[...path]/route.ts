import { auth } from "@lib/auth";
import {
  getDirectApiUrl,
  InvalidApiPathError,
  mintApiAccessToken,
} from "@lib/api-auth";
import { isHostedAuthMode } from "@lib/auth-mode";
import { resolveProxyAuthorization } from "@lib/proxy-auth";

type RouteContext = {
  params:
    | Promise<{
        path?: string[];
      }>
    | {
        path?: string[];
      };
};

const INVALID_PROXY_PATH_RESPONSE = Response.json(
  { message: "Invalid API path." },
  { status: 400 },
);

function stripForwardedHeaders(headers: Headers): Headers {
  const forwardedHeaders = new Headers(headers);

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

function toUpstreamResponse(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.delete("set-cookie");

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function buildProxiedPath(
  pathSegments: string[] | undefined,
  request: Request,
) {
  for (const segment of pathSegments ?? []) {
    if (!segment || segment.includes("/") || segment.includes("\\")) {
      throw new InvalidApiPathError();
    }
  }

  const pathname = pathSegments?.length ? `/${pathSegments.join("/")}` : "/";
  const search = new URL(request.url).search;
  return `${pathname}${search}`;
}

async function forwardRequest(
  request: Request,
  context: RouteContext,
): Promise<Response> {
  try {
    const params = await context.params;
    const path = buildProxiedPath(params.path, request);
    const headers = stripForwardedHeaders(request.headers);
    const session = isHostedAuthMode() ? await auth() : null;
    const authorization = await resolveProxyAuthorization({
      hostedAuthMode: isHostedAuthMode(),
      sessionUser: session?.user,
      mintToken: mintApiAccessToken,
    });

    if (!authorization.ok) {
      return authorization.response;
    }

    if (authorization.authorizationHeader) {
      headers.set("Authorization", authorization.authorizationHeader);
    }

    const upstreamResponse = await fetch(getDirectApiUrl(path), {
      method: request.method,
      headers,
      body:
        request.method === "GET" || request.method === "HEAD"
          ? undefined
          : request.body,
      cache: "no-store",
      duplex: "half",
      redirect: "manual",
    } as RequestInit & { duplex: "half" });

    return toUpstreamResponse(upstreamResponse);
  } catch (error) {
    if (error instanceof InvalidApiPathError) {
      return INVALID_PROXY_PATH_RESPONSE;
    }

    throw error;
  }
}

export const runtime = "nodejs";

export async function GET(request: Request, context: RouteContext) {
  return forwardRequest(request, context);
}

export async function POST(request: Request, context: RouteContext) {
  return forwardRequest(request, context);
}

export async function PUT(request: Request, context: RouteContext) {
  return forwardRequest(request, context);
}

export async function DELETE(request: Request, context: RouteContext) {
  return forwardRequest(request, context);
}

export async function PATCH(request: Request, context: RouteContext) {
  return forwardRequest(request, context);
}
