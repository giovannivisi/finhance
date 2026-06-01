import { isHostedAuthMode } from "./auth-mode.shared.ts";

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "::1", "localhost"]);
const LOOPBACK_IPS = new Set([
  "127.0.0.1",
  "::1",
  "::ffff:127.0.0.1",
  "localhost",
]);

export const LOCAL_MODE_LOOPBACK_ONLY_MESSAGE =
  "This local-mode web app only accepts loopback requests.";
export const LOCAL_MODE_PRODUCTION_MESSAGE =
  "This deployment must run with AUTH_MODE=hosted.";

type RequestLike = {
  headers: Headers;
  url: string;
};

function readFirstHeaderValue(headers: Headers, name: string): string | null {
  const value = headers.get(name)?.split(",")[0]?.trim();
  return value ? value : null;
}

function normalizeHostCandidate(candidate: string): string | null {
  const normalized = candidate.trim().toLowerCase();

  if (!normalized) {
    return null;
  }

  if (normalized.startsWith("[")) {
    const closing = normalized.indexOf("]");
    if (closing === -1) {
      return null;
    }

    return normalized.slice(1, closing);
  }

  if (
    normalized.includes(":") &&
    normalized.indexOf(":") !== normalized.lastIndexOf(":")
  ) {
    return normalized;
  }

  const colon = normalized.lastIndexOf(":");
  return colon === -1 ? normalized : normalized.slice(0, colon);
}

function normalizeIpCandidate(candidate: string): string | null {
  const normalized = candidate.trim().toLowerCase();

  if (!normalized) {
    return null;
  }

  if (normalized.startsWith("[")) {
    const closing = normalized.indexOf("]");
    if (closing === -1) {
      return null;
    }

    return normalized.slice(1, closing);
  }

  if (
    normalized.includes(".") &&
    normalized.includes(":") &&
    normalized.indexOf(":") === normalized.lastIndexOf(":")
  ) {
    return normalized.slice(0, normalized.lastIndexOf(":"));
  }

  return normalized;
}

function resolveUrlHostname(requestUrl: string): string | null {
  try {
    return new URL(requestUrl).hostname;
  } catch {
    return null;
  }
}

export function isLoopbackHost(candidate: string): boolean {
  const normalized = normalizeHostCandidate(candidate);
  return normalized !== null && LOOPBACK_HOSTS.has(normalized);
}

export function isLoopbackIp(candidate: string): boolean {
  const normalized = normalizeIpCandidate(candidate);
  return normalized !== null && LOOPBACK_IPS.has(normalized);
}

export function isLoopbackRequest(request: RequestLike): boolean {
  const hostCandidates = [
    readFirstHeaderValue(request.headers, "x-forwarded-host"),
    readFirstHeaderValue(request.headers, "host"),
    resolveUrlHostname(request.url),
  ].filter((value): value is string => value !== null);

  if (hostCandidates.length === 0) {
    return false;
  }

  if (hostCandidates.some((candidate) => !isLoopbackHost(candidate))) {
    return false;
  }

  for (const headerName of ["x-forwarded-for", "x-real-ip"]) {
    const value = readFirstHeaderValue(request.headers, headerName);

    if (value && !isLoopbackIp(value)) {
      return false;
    }
  }

  return true;
}

export function resolveLocalRequestRejection(
  request: RequestLike,
  env: NodeJS.ProcessEnv = process.env,
): { status: number; message: string } | null {
  if (isHostedAuthMode(env)) {
    return null;
  }

  if (env.NODE_ENV === "production") {
    return {
      status: 503,
      message: LOCAL_MODE_PRODUCTION_MESSAGE,
    };
  }

  if (!isLoopbackRequest(request)) {
    return {
      status: 403,
      message: LOCAL_MODE_LOOPBACK_ONLY_MESSAGE,
    };
  }

  return null;
}
