type RequestLike = {
  ips?: unknown;
  ip?: unknown;
  socket?: {
    remoteAddress?: unknown;
  } | null;
  headers?: Record<string, string | string[] | undefined>;
};

function normalizeIp(candidate: unknown): string | null {
  if (typeof candidate !== 'string') {
    return null;
  }

  const normalized = candidate.trim();
  return normalized.length > 0 ? normalized : null;
}

export function resolveClientIp(request: RequestLike): string {
  if (Array.isArray(request.ips)) {
    for (const candidate of request.ips) {
      const ip = normalizeIp(candidate);
      if (ip) {
        return ip;
      }
    }
  }

  const directIp = normalizeIp(request.ip);
  if (directIp) {
    return directIp;
  }

  const remoteAddress = normalizeIp(request.socket?.remoteAddress);
  if (remoteAddress) {
    return remoteAddress;
  }

  return 'unknown';
}

export function isLoopbackIp(candidate: string): boolean {
  return (
    candidate === '127.0.0.1' ||
    candidate === '::1' ||
    candidate === '::ffff:127.0.0.1'
  );
}

const LOOPBACK_HOSTNAMES = new Set(['localhost', '127.0.0.1', '::1']);

export function isLoopbackHostHeader(
  rawHostHeader: string | string[] | undefined,
): boolean {
  const value = Array.isArray(rawHostHeader) ? rawHostHeader[0] : rawHostHeader;

  if (typeof value !== 'string') {
    return false;
  }

  const trimmed = value.trim().toLowerCase();
  if (!trimmed) {
    return false;
  }

  const hostname = extractHostname(trimmed);
  return hostname !== null && LOOPBACK_HOSTNAMES.has(hostname);
}

function extractHostname(hostHeader: string): string | null {
  if (hostHeader.startsWith('[')) {
    const closing = hostHeader.indexOf(']');
    if (closing === -1) {
      return null;
    }
    return hostHeader.slice(1, closing);
  }

  const colon = hostHeader.lastIndexOf(':');
  if (colon === -1) {
    return hostHeader;
  }

  return hostHeader.slice(0, colon);
}
