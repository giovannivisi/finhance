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

function errorMetaString(
  value: Prisma.PrismaClientKnownRequestError['meta'],
  key: string,
): string | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const candidate = value[key];
  return typeof candidate === 'string' ? candidate : null;
}

export function isRetryableConnectionError(
  error: unknown,
): error is
  | Prisma.PrismaClientKnownRequestError
  | Prisma.PrismaClientInitializationError
  | Prisma.PrismaClientUnknownRequestError {
  if (error instanceof Prisma.PrismaClientInitializationError) {
    return (
      error.message.includes("Can't reach database server at") ||
      error.message.includes(
        'Timed out fetching a new connection from the connection pool.',
      )
    );
  }

  if (error instanceof Prisma.PrismaClientUnknownRequestError) {
    return error.message.includes('Response from the Engine was empty');
  }

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

const READ_OPERATIONS = new Set([
  'findUnique',
  'findUniqueOrThrow',
  'findFirst',
  'findFirstOrThrow',
  'findMany',
  'aggregate',
  'count',
  'groupBy',
]);

export function shouldRetryPrismaOperation(
  operation: string,
  error: unknown,
): boolean {
  if (!isRetryableConnectionError(error)) {
    return false;
  }

  // An empty engine response is ambiguous: a mutation may already have
  // committed even though Prisma did not receive its result. Only replay
  // reads for that error; connection acquisition/start errors are safe to
  // retry because the query has not begun executing yet.
  if (error instanceof Prisma.PrismaClientUnknownRequestError) {
    return READ_OPERATIONS.has(operation);
  }

  return true;
}

export function isRetryableClosedTransactionError(
  error: unknown,
): error is Prisma.PrismaClientKnownRequestError {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2028' &&
    (errorMessageIncludes(error.meta, 'Transaction not found.') ||
      error.message.includes('Transaction not found.'))
  );
}

export function isSchemaDriftError(
  error: unknown,
): error is Prisma.PrismaClientKnownRequestError {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2022'
  );
}

function toActionableSchemaDriftError(
  error: Prisma.PrismaClientKnownRequestError,
  operationLabel: string,
): Error {
  const column = errorMetaString(error.meta, 'column');
  const modelName = errorMetaString(error.meta, 'modelName');

  if (column === 'Transaction.splitGroupId' && modelName === 'Transaction') {
    return new Error(
      `Database schema is behind the current codebase: missing ${column} required by ${operationLabel}. Run "pnpm db:migrate:deploy" (or "pnpm db:migrate:dev" for local development) and retry.`,
      { cause: error },
    );
  }

  return error;
}

export async function runWithTransientRetry<T>({
  logger,
  operationLabel,
  operation,
  reconnect,
  shouldRetry = isRetryableConnectionError,
}: {
  logger: Pick<Logger, 'warn'>;
  operationLabel: string;
  operation: () => Promise<T>;
  reconnect: () => Promise<void>;
  shouldRetry?: (error: unknown) => boolean;
}): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (isSchemaDriftError(error)) {
      throw toActionableSchemaDriftError(error, operationLabel);
    }

    if (!shouldRetry(error)) {
      throw error;
    }

    logger.warn(
      `Retrying Prisma operation after transient database connectivity failure: ${operationLabel}`,
    );
    await reconnect();
    return operation();
  }
}

type ConnectRetryLogger = Pick<Logger, 'warn'>;

export async function connectWithTransientRetry({
  logger,
  operationLabel,
  connect,
  attempts = 3,
  initialDelayMs = 250,
  sleep = (delayMs: number) =>
    new Promise<void>((resolve) => setTimeout(resolve, delayMs)),
}: {
  logger: ConnectRetryLogger;
  operationLabel: string;
  connect: () => Promise<void>;
  attempts?: number;
  initialDelayMs?: number;
  sleep?: (delayMs: number) => Promise<void>;
}): Promise<void> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      await connect();
      return;
    } catch (error) {
      lastError = error;

      if (!isRetryableConnectionError(error) || attempt === attempts) {
        throw error;
      }

      const delayMs = initialDelayMs * attempt;
      logger.warn(
        `Retrying Prisma connection after transient database connectivity failure: ${operationLabel} (attempt ${attempt + 1}/${attempts})`,
      );
      await sleep(delayMs);
    }
  }

  throw lastError;
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
    const connectWithRetry = async (operationLabel: string) => {
      await connectWithTransientRetry({
        logger,
        operationLabel,
        connect: () => extended.$connect(),
      });
    };

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

        await connectWithRetry('prisma.reconnect');
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
            shouldRetry: (error) =>
              shouldRetryPrismaOperation(operation, error),
          });
        },
      },
    }) as PrismaService;

    Object.defineProperties(extended, {
      onModuleInit: {
        value: async () => {
          await connectWithRetry('prisma.startup');
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
    await connectWithTransientRetry({
      logger: new Logger(PrismaService.name),
      operationLabel: 'prisma.startup',
      connect: () => this.$connect(),
    });
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

    await connectWithTransientRetry({
      logger: new Logger(PrismaService.name),
      operationLabel: 'prisma.reconnect',
      connect: () => this.$connect(),
    });
  }
}
