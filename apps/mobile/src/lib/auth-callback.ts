/**
 * Extracts the mobile session token from the authorize redirect URL.
 * The web hands the token back in the fragment (`finhance://auth#token=…`);
 * a query parameter is accepted as a defensive fallback.
 */
export function parseMobileAuthCallback(url: string): string | null {
  const hashIndex = url.indexOf("#");

  if (hashIndex !== -1) {
    const fragment = url.slice(hashIndex + 1);
    const params = new URLSearchParams(fragment);
    const token = params.get("token")?.trim();

    if (token) {
      return token;
    }
  }

  try {
    const token = new URL(url).searchParams.get("token")?.trim();
    return token || null;
  } catch {
    return null;
  }
}

export type ServerKind =
  | { kind: "local-api" }
  | { kind: "hosted-api" }
  | { kind: "hosted-web" }
  | { kind: "local-web" }
  | { kind: "unknown" };

/**
 * Classifies a server from its health payloads. `apiHealth` comes from
 * `GET /health` (the NestJS API), `webHealth` from `GET /api/mobile/health`
 * (the Next.js web app).
 */
export function classifyServer(
  apiHealth: { service?: string; authMode?: string } | null,
  webHealth: { service?: string; authMode?: string } | null,
): ServerKind {
  if (apiHealth?.service === "api") {
    return apiHealth.authMode === "hosted"
      ? { kind: "hosted-api" }
      : { kind: "local-api" };
  }

  if (webHealth?.service === "finhance-web") {
    return webHealth.authMode === "hosted"
      ? { kind: "hosted-web" }
      : { kind: "local-web" };
  }

  return { kind: "unknown" };
}
