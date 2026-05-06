import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { Prisma, PrismaClient } from '@finhance/db';

export function isRetryableConnectionError(
  error: unknown,
): error is Prisma.PrismaClientKnownRequestError {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P1001'
  );
}

export async function runWithTransientRetry<T>({
  logger,
  operationLabel,
  operation,
  reconnect,
}: {
  logger: Pick<Logger, 'warn'>;
  operationLabel: string;
  operation: () => Promise<T>;
  reconnect: () => Promise<void>;
}): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (!isRetryableConnectionError(error)) {
      throw error;
    }

    logger.warn(
      `Retrying Prisma operation after transient database connectivity failure: ${operationLabel}`,
    );
    await reconnect();
    return operation();
  }
}

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor() {
    super();

    const logger = new Logger(PrismaService.name);
    let reconnectPromise: Promise<void> | null = null;

    const extended = this.$extends({
      query: {
        async $allOperations({ model, operation, args, query }) {
          const operationLabel = `${model ?? 'raw'}.${operation}`;

          const reconnect = async () => {
            if (reconnectPromise) {
              await reconnectPromise;
              return;
            }

            reconnectPromise = (async () => {
              try {
                await extended.$disconnect();
              } catch {
                // Ignore disconnect failures while recovering a stale connection.
              }

              await extended.$connect();
            })();

            try {
              await reconnectPromise;
            } finally {
              reconnectPromise = null;
            }
          };

          return runWithTransientRetry<unknown>({
            logger,
            operationLabel,
            operation: () => query(args) as Promise<unknown>,
            reconnect,
          });
        },
      },
    }) as PrismaService;

    Object.defineProperties(extended, {
      onModuleInit: {
        value: async () => {
          await extended.$connect();
        },
      },
      onModuleDestroy: {
        value: async () => {
          await extended.$disconnect();
        },
      },
    });

    return extended;
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
