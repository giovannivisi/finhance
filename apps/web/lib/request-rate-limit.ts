import { Prisma } from "@finhance/db";
import { prisma } from "@lib/prisma";

export interface RequestRateLimitConfig {
  limit: number;
  windowMs: number;
  scope: string;
}

export interface RequestRateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: Date;
  retryAfterSeconds: number;
  headers: Record<string, string>;
}

const CLIENT_IP_HEADERS = [
  "x-forwarded-for",
  "x-real-ip",
  "cf-connecting-ip",
  "true-client-ip",
];

export const MOBILE_AUTH_RATE_LIMITS = {
  passkeyOptions: {
    limit: 20,
    windowMs: 60_000,
    scope: "mobile-passkey-options",
  },
  passkeyVerify: {
    limit: 10,
    windowMs: 60_000,
    scope: "mobile-passkey-verify",
  },
  tokenExchange: {
    limit: 10,
    windowMs: 60_000,
    scope: "mobile-token-exchange",
  },
} as const satisfies Record<string, RequestRateLimitConfig>;

export function rateLimitRequest(
  request: Request,
  config: RequestRateLimitConfig,
  now = Date.now(),
): Promise<RequestRateLimitResult> {
  const clientKey = resolveClientKey(request);
  const key = `${config.scope}:${clientKey}`;

  return prisma.$transaction(
    async (tx) => {
      const currentDate = new Date(now);
      const resetAt = new Date(now + config.windowMs);

      await tx.requestRateLimit.deleteMany({
        where: {
          scope: config.scope,
          resetAt: { lte: currentDate },
        },
      });

      const existing = await tx.requestRateLimit.findUnique({
        where: { key },
      });
      const record =
        existing && existing.resetAt.getTime() > now
          ? await tx.requestRateLimit.update({
              where: { key },
              data: { count: { increment: 1 } },
            })
          : await tx.requestRateLimit.upsert({
              where: { key },
              update: {
                scope: config.scope,
                clientKey,
                count: 1,
                resetAt,
              },
              create: {
                key,
                scope: config.scope,
                clientKey,
                count: 1,
                resetAt,
              },
            });

      const remaining = Math.max(config.limit - record.count, 0);
      const retryAfterSeconds = Math.max(
        1,
        Math.ceil((record.resetAt.getTime() - now) / 1000),
      );
      const headers = {
        "Retry-After": String(retryAfterSeconds),
        "X-RateLimit-Limit": String(config.limit),
        "X-RateLimit-Remaining": String(remaining),
        "X-RateLimit-Reset": String(Math.ceil(record.resetAt.getTime() / 1000)),
      };

      return {
        allowed: record.count <= config.limit,
        limit: config.limit,
        remaining,
        resetAt: record.resetAt,
        retryAfterSeconds,
        headers,
      };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}

export async function resetRequestRateLimitsForTests(): Promise<void> {
  await prisma.requestRateLimit.deleteMany();
}

function resolveClientKey(request: Request): string {
  for (const header of CLIENT_IP_HEADERS) {
    const value = request.headers.get(header);
    const client = value?.split(",")[0]?.trim();

    if (client) {
      return client;
    }
  }

  return "unknown";
}
