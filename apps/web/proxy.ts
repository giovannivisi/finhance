import { NextResponse } from "next/server";
import { auth } from "@lib/auth";
import { isHostedAuthMode } from "@lib/auth-mode";
import { resolveLocalRequestRejection } from "@lib/local-request";
import {
  buildSignInRedirectUrl,
  isPublicHostedProxyPath,
} from "@lib/proxy-auth";

const CSP_NONCE_HEADER = "x-nonce";

function createNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function buildContentSecurityPolicy(nonce: string): string {
  const scriptSrc = [
    "'self'",
    `'nonce-${nonce}'`,
    ...(process.env.NODE_ENV === "production" ? [] : ["'unsafe-eval'"]),
  ].join(" ");

  return [
    "default-src 'self'",
    `script-src ${scriptSrc}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "connect-src 'self'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
  ].join("; ");
}

function withContentSecurityPolicy(
  response: NextResponse,
  policy: string,
): NextResponse {
  response.headers.set("Content-Security-Policy", policy);
  return response;
}

const authenticatedProxy = auth((request) => {
  const nonce = createNonce();
  const contentSecurityPolicy = buildContentSecurityPolicy(nonce);
  const requestHeaders = new Headers(request.headers);
  const pathname = new URL(request.url).pathname;
  requestHeaders.set(CSP_NONCE_HEADER, nonce);
  requestHeaders.set("Content-Security-Policy", contentSecurityPolicy);
  requestHeaders.set("x-finhance-pathname", pathname);

  const localRequestRejection = resolveLocalRequestRejection(request);

  if (localRequestRejection) {
    return withContentSecurityPolicy(
      new NextResponse(localRequestRejection.message, {
        status: localRequestRejection.status,
        headers: {
          "cache-control": "no-store",
          "content-type": "text/plain; charset=utf-8",
        },
      }),
      contentSecurityPolicy,
    );
  }

  if (!isHostedAuthMode()) {
    return withContentSecurityPolicy(
      NextResponse.next({ request: { headers: requestHeaders } }),
      contentSecurityPolicy,
    );
  }

  if (isPublicHostedProxyPath(pathname)) {
    return withContentSecurityPolicy(
      NextResponse.next({ request: { headers: requestHeaders } }),
      contentSecurityPolicy,
    );
  }

  if (request.auth) {
    return withContentSecurityPolicy(
      NextResponse.next({ request: { headers: requestHeaders } }),
      contentSecurityPolicy,
    );
  }

  return withContentSecurityPolicy(
    NextResponse.redirect(buildSignInRedirectUrl(request.url)),
    contentSecurityPolicy,
  );
});

export function proxy(...args: Parameters<typeof authenticatedProxy>) {
  return authenticatedProxy(...args);
}

export default proxy;

export const config = {
  matcher: [
    // `.well-known` is excluded so the Apple App Site Association file (and any
    // other well-known resource) is served publicly without an auth redirect —
    // Apple requires it reachable with no redirect.
    "/((?!api|_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|\\.well-known).*)",
  ],
};
