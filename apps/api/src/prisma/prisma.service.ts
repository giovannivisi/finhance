import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { Prisma, PrismaClient } from '@finhance/db';

function errorMessageIncludes(
  value: Prisma.PrismaClientKnownRequestError['meta'],
  pattern: string,
): boolean {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const metaError =
    'error' in value && typeof value.error === 'string' ? value.error : null;

  return metaError?.includes(pattern) ?? false;
}

export function isRetryableConnectionError(
  error: unknown,
): error is Prisma.PrismaClientKnownRequestError {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    (error.code === 'P1001' ||
      error.code === 'P2024' ||
      (error.code === 'P2028' &&
        (errorMessageIncludes(
          error.meta,
          'Unable to start a transaction in the given time.',
        ) ||
          error.message.includes(
            'Unable to start a transaction in the given time.',
          ))))
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

    const extended = this.$extends({
      query: {
        async $allOperations({ model, operation, args, query }) {
          const operationLabel = `${model ?? 'raw'}.${operation}`;

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
      recoverConnection: {
        value: reconnect,
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

  async recoverConnection() {
    try {
      await this.$disconnect();
    } catch {
      // Ignore disconnect failures while recovering a stale connection.
    }

    await this.$connect();
  }
}
