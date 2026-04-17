import { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface';

const DEFAULT_API_HOST = '127.0.0.1';
const DEFAULT_ALLOWED_ORIGINS = [
  'http://localhost:3001',
  'http://127.0.0.1:3001',
] as const;
const LOOPBACK_HOSTS = new Set(['127.0.0.1', '::1', 'localhost']);

export interface BootstrapRuntimeConfig {
  host: string;
  allowedOrigins: string[];
  trustProxy: boolean | number;
}

export function normalizeHost(rawHost?: string): string {
  const normalized = (rawHost ?? DEFAULT_API_HOST).trim();

  if (!normalized) {
    return DEFAULT_API_HOST;
  }

  if (normalized.startsWith('[') && normalized.endsWith(']')) {
    return normalized.slice(1, -1);
  }

  return normalized;
}

export function isLoopbackHost(host: string): boolean {
  return LOOPBACK_HOSTS.has(normalizeHost(host).toLowerCase());
}

export function parseAllowedOrigins(rawOrigins?: string): string[] {
  if (!rawOrigins || !rawOrigins.trim()) {
    return [...DEFAULT_ALLOWED_ORIGINS];
  }

  const origins = rawOrigins.split(',').map((origin) => origin.trim());

  if (origins.some((origin) => origin.length === 0)) {
    throw new Error('API_ALLOWED_ORIGINS cannot contain empty entries.');
  }

  if (origins.includes('*')) {
    throw new Error('API_ALLOWED_ORIGINS does not support wildcard origins.');
  }

  return Array.from(new Set(origins));
}

export function parseTrustProxy(rawTrustProxy?: string): boolean | number {
  if (!rawTrustProxy || !rawTrustProxy.trim()) {
    return false;
  }

  const normalized = rawTrustProxy.trim().toLowerCase();

  if (normalized === 'true') {
    return true;
  }

  if (normalized === 'false') {
    return false;
  }

  const proxyCount = Number(normalized);

  if (Number.isInteger(proxyCount) && proxyCount >= 1) {
    return proxyCount;
  }

  throw new Error(
    'API_TRUST_PROXY must be "true", "false", or a positive integer.',
  );
}

export function isAllowedCorsOrigin(
  origin: string | undefined,
  allowedOrigins: readonly string[],
): boolean {
  return (
    origin === undefined || origin === '' || allowedOrigins.includes(origin)
  );
}

export function createCorsOptions(
  allowedOrigins: readonly string[],
): CorsOptions {
  return {
    origin: (origin, callback) => {
      if (isAllowedCorsOrigin(origin, allowedOrigins)) {
        callback(null, true);
        return;
      }

      callback(
        new Error(
          `Origin ${origin ?? '<unknown>'} is not allowed by API_ALLOWED_ORIGINS.`,
        ),
        false,
      );
    },
    optionsSuccessStatus: 204,
  };
}

export function resolveBootstrapRuntimeConfig(
  env: NodeJS.ProcessEnv = process.env,
): BootstrapRuntimeConfig {
  const host = normalizeHost(env.API_HOST);
  const allowNonLoopback = env.ALLOW_NON_LOOPBACK === 'true';

  if (!isLoopbackHost(host) && !allowNonLoopback) {
    throw new Error(
      `Refusing to bind API_HOST=${host} without ALLOW_NON_LOOPBACK=true.`,
    );
  }

  return {
    host,
    allowedOrigins: parseAllowedOrigins(env.API_ALLOWED_ORIGINS),
    trustProxy: parseTrustProxy(env.API_TRUST_PROXY),
  };
}
