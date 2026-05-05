import { NextResponse } from "next/server";
import { auth } from "@lib/auth";
import { isHostedAuthMode } from "@lib/auth-mode";

const authenticatedProxy = auth((request) => {
  if (!isHostedAuthMode()) {
    return NextResponse.next();
  }

  if (request.auth) {
    return NextResponse.next();
  }

  const signInUrl = new URL("/api/auth/signin", request.nextUrl.origin);
  signInUrl.searchParams.set(
    "callbackUrl",
    `${request.nextUrl.pathname}${request.nextUrl.search}`,
  );

  return NextResponse.redirect(signInUrl);
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
