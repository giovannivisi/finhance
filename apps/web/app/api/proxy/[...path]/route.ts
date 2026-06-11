import { auth } from "@lib/auth";
import {
  buildUpstreamRequest,
  resolveCrossOriginRejection,
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
import { resolveMobileBearerUser } from "@lib/mobile-auth";
import { resolveProxyAuthorization } from "@lib/proxy-auth";
import {
  clearServerApiCacheForUser,
  getServerApiCacheUserKey,
} from "@lib/server-api-cache";

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

function isMutationMethod(method: string): boolean {
  return method !== "GET" && method !== "HEAD";
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
    const localRequestRejection = resolveLocalRequestRejection(request);

    if (localRequestRejection) {
      return Response.json(
        { message: localRequestRejection.message },
        { status: localRequestRejection.status },
      );
    }

    const crossOriginRejection = resolveCrossOriginRejection(request);

    if (crossOriginRejection) {
      return crossOriginRejection;
    }

    const params = await context.params;
    const path = buildProxiedPath(params.path, request);
    const hostedAuthMode = isHostedAuthMode();
    const headers = stripForwardedHeaders(request.headers, {
      stripBrowserContext: hostedAuthMode,
    });
    const session = hostedAuthMode ? await auth() : null;
    let actor: { id?: string | null; email?: string | null } | null =
      session?.user ?? null;

    if (hostedAuthMode && !actor?.id) {
      // The mobile app authenticates with a web-minted bearer token instead
      // of a session cookie; it is exchanged here for the same short-lived
      // API JWT a browser session would get.
      const bearer = await resolveMobileBearerUser(
        request.headers.get("authorization"),
      );

      if (bearer.present && bearer.invalid) {
        return Response.json(
          { message: "Mobile session is invalid or expired." },
          { status: 401 },
        );
      }

      if (bearer.present && !bearer.invalid) {
        actor = { id: bearer.user.userId, email: bearer.user.email };
      }
    }

    const authorization = await resolveProxyAuthorization({
      hostedAuthMode,
      sessionUser: actor,
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

    if (upstreamResponse.ok && isMutationMethod(request.method)) {
      clearServerApiCacheForUser(
        getServerApiCacheUserKey({
          hostedAuthMode,
          userId: actor?.id,
        }),
      );
    }

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
