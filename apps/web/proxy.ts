import { NextResponse } from "next/server";
import { auth } from "@lib/auth";
import { isHostedAuthMode } from "@lib/auth-mode";
import { resolveLocalRequestRejection } from "@lib/local-request";
import {
  buildSignInRedirectUrl,
  isPublicHostedProxyPath,
} from "@lib/proxy-auth";

const authenticatedProxy = auth((request) => {
  const localRequestRejection = resolveLocalRequestRejection(request);

  if (localRequestRejection) {
    return new NextResponse(localRequestRejection.message, {
      status: localRequestRejection.status,
      headers: {
        "cache-control": "no-store",
        "content-type": "text/plain; charset=utf-8",
      },
    });
  }

  if (!isHostedAuthMode()) {
    return NextResponse.next();
  }

  if (isPublicHostedProxyPath(new URL(request.url).pathname)) {
    return NextResponse.next();
  }

  if (request.auth) {
    return NextResponse.next();
  }

  return NextResponse.redirect(buildSignInRedirectUrl(request.url));
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
