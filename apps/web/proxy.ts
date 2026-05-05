import { NextResponse } from "next/server";
import { auth } from "@lib/auth";
import { isHostedAuthMode } from "@lib/auth-mode";
import { buildSignInRedirectUrl } from "@lib/proxy-auth";

const authenticatedProxy = auth((request) => {
  if (!isHostedAuthMode()) {
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
    "/((?!api|_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)",
  ],
};
