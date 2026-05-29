import { auth } from "@lib/auth";
import {
  buildUpstreamRequest,
  stripForwardedHeaders,
  toUpstreamResponse,
} from "@lib/api-proxy";
import {
  getDirectApiUrl,
  InvalidApiPathError,
  mintApiAccessToken,
} from "@lib/api-auth";
import { isHostedAuthMode } from "@lib/auth-mode";
import { resolveLocalRequestRejection } from "@lib/local-request";
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
    const localRequestRejection = resolveLocalRequestRejection(request);

    if (localRequestRejection) {
      return Response.json(
        { message: localRequestRejection.message },
        { status: localRequestRejection.status },
      );
    }

    const params = await context.params;
    const path = buildProxiedPath(params.path, request);
    const headers = stripForwardedHeaders(request.headers);
    const hostedAuthMode = isHostedAuthMode();
    const session = hostedAuthMode ? await auth() : null;
    const authorization = await resolveProxyAuthorization({
      hostedAuthMode,
      sessionUser: session?.user,
      mintToken: mintApiAccessToken,
    });

    if (!authorization.ok) {
      return authorization.response;
    }

    if (authorization.authorizationHeader) {
      headers.set("Authorization", authorization.authorizationHeader);
    }
    headers.set("Accept-Encoding", "identity");

    const upstreamRequest = await buildUpstreamRequest(request);
    const upstreamResponse = await fetch(getDirectApiUrl(path), {
      method: request.method,
      headers,
      body: upstreamRequest.body,
      cache: "no-store",
      duplex: upstreamRequest.duplex,
      redirect: "manual",
    } as RequestInit & { duplex: "half" });

    return await toUpstreamResponse(upstreamResponse);
  } catch (error) {
    if (error instanceof InvalidApiPathError) {
      return INVALID_PROXY_PATH_RESPONSE;
    }

    throw error;
  }
}

export const runtime = "nodejs";
export const preferredRegion = "fra1";

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
