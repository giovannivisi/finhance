const LOCAL_DEV_API_URL = "http://127.0.0.1:3000";

function isLoopbackHostname(hostname: string): boolean {
  const normalized = hostname.trim().toLowerCase();
  return (
    normalized === "localhost" ||
    normalized === "127.0.0.1" ||
    normalized === "::1"
  );
}

function shouldPreferLocalApiUrl(
  baseUrl: string,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  if (env.NODE_ENV === "production" || env.VERCEL) {
    return false;
  }

  try {
    const parsed = new URL(baseUrl);
    return !isLoopbackHostname(parsed.hostname);
  } catch {
    return false;
  }
}

export function resolveServerApiBaseUrl(
  env: NodeJS.ProcessEnv = process.env,
): string {
  const internalBaseUrl = env.API_INTERNAL_URL?.trim();
  if (internalBaseUrl) {
    return internalBaseUrl;
  }

  const publicBaseUrl = env.NEXT_PUBLIC_API_URL?.trim();

  if (!publicBaseUrl) {
    throw new Error("NEXT_PUBLIC_API_URL is not configured.");
  }

  if (shouldPreferLocalApiUrl(publicBaseUrl, env)) {
    return LOCAL_DEV_API_URL;
  }

  return publicBaseUrl;
}
