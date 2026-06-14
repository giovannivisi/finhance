type SessionUserLike = {
  id?: string | null;
  email?: string | null;
};

const PUBLIC_HOSTED_PROXY_PATHS = new Set(["/privacy"]);

export function isPublicHostedProxyPath(pathname: string): boolean {
  const normalizedPath =
    pathname.length > 1 && pathname.endsWith("/")
      ? pathname.slice(0, -1)
      : pathname;

  return PUBLIC_HOSTED_PROXY_PATHS.has(normalizedPath);
}

export function buildSignInRedirectUrl(requestUrl: string): string {
  const currentUrl = new URL(requestUrl);
  const signInUrl = new URL("/api/auth/signin", currentUrl.origin);
  signInUrl.searchParams.set(
    "callbackUrl",
    `${currentUrl.pathname}${currentUrl.search}`,
  );
  return signInUrl.toString();
}

export async function resolveProxyAuthorization(input: {
  hostedAuthMode: boolean;
  sessionUser: SessionUserLike | null | undefined;
  mintToken: (payload: {
    userId: string;
    email?: string | null;
  }) => Promise<string>;
}): Promise<
  | {
      ok: true;
      authorizationHeader: string | null;
    }
  | {
      ok: false;
      response: Response;
    }
> {
  if (!input.hostedAuthMode) {
    return {
      ok: true,
      authorizationHeader: null,
    };
  }

  const userId = input.sessionUser?.id?.trim();

  if (!userId) {
    return {
      ok: false,
      response: Response.json(
        { message: "Authentication is required." },
        { status: 401 },
      ),
    };
  }

  return {
    ok: true,
    authorizationHeader: `Bearer ${await input.mintToken({
      userId,
      email: input.sessionUser?.email ?? null,
    })}`,
  };
}
