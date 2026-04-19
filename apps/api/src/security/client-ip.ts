type RequestLike = {
  ips?: unknown;
  ip?: unknown;
  socket?: {
    remoteAddress?: unknown;
  } | null;
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
