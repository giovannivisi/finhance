import { Injectable } from '@nestjs/common';
import { Prisma } from '@finhance/db';
import { PrismaService } from '@prisma/prisma.service';

const MARKET_DATA_RATE_LIMIT_SCOPE = 'market-data-provider';
const RATE_LIMIT_WINDOW_MS = 60_000;
const DEFAULT_REQUEST_LIMIT_PER_MINUTE = 10;
const MAX_SERIALIZABLE_ATTEMPTS = 3;

export class MarketDataRequestLimitExceededError extends Error {
  constructor() {
    super('The market-data request limit has been reached.');
    this.name = MarketDataRequestLimitExceededError.name;
  }
}

export function resolveMarketDataRequestLimitPerMinute(
  env: NodeJS.ProcessEnv = process.env,
): number {
  const configured = Number(env.MARKET_DATA_REQUEST_LIMIT_PER_MINUTE);

  return Number.isSafeInteger(configured) && configured > 0
    ? configured
    : DEFAULT_REQUEST_LIMIT_PER_MINUTE;
}

@Injectable()
export class MarketDataRateLimitService {
  constructor(private readonly prisma: PrismaService) {}

  async reserve(providerGroup: string, now = new Date()): Promise<void> {
    const limit = resolveMarketDataRequestLimitPerMinute();
    const windowStartMs =
      Math.floor(now.getTime() / RATE_LIMIT_WINDOW_MS) * RATE_LIMIT_WINDOW_MS;
    const resetAt = new Date(windowStartMs + RATE_LIMIT_WINDOW_MS);
    const key = `market-data:${providerGroup}:${windowStartMs}`;

    for (let attempt = 1; attempt <= MAX_SERIALIZABLE_ATTEMPTS; attempt += 1) {
      try {
        await this.prisma.$transaction(
          async (tx) => {
            await tx.requestRateLimit.deleteMany({
              where: {
                scope: MARKET_DATA_RATE_LIMIT_SCOPE,
                resetAt: { lte: now },
              },
            });

            const current = await tx.requestRateLimit.findUnique({
              where: { key },
              select: { count: true },
            });

            if (current && current.count >= limit) {
              throw new MarketDataRequestLimitExceededError();
            }

            if (current) {
              await tx.requestRateLimit.update({
                where: { key },
                data: { count: { increment: 1 } },
              });
              return;
            }

            await tx.requestRateLimit.create({
              data: {
                key,
                scope: MARKET_DATA_RATE_LIMIT_SCOPE,
                clientKey: providerGroup,
                count: 1,
                resetAt,
              },
            });
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        );
        return;
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          (error.code === 'P2034' || error.code === 'P2002') &&
          attempt < MAX_SERIALIZABLE_ATTEMPTS
        ) {
          continue;
        }

        throw error;
      }
    }

    throw new Error('Unable to reserve market-data quota.');
  }
}
