import { Prisma } from '@finhance/db';
import { PrismaService } from '@/prisma/prisma.service';

const MAX_SERIALIZATION_RETRIES = 2;

export interface SerializableTransactionOptions {
  maxWait?: number;
  timeout?: number;
}

function isSerializationConflict(
  error: unknown,
): error is Prisma.PrismaClientKnownRequestError {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2034'
  );
}

/**
 * Run a read-then-write transaction at Serializable isolation and retry only
 * PostgreSQL serialization failures. Re-running the whole callback is safe
 * because Prisma rolls back the failed transaction before returning P2034.
 */
export async function runSerializableTransaction<T>(
  prisma: PrismaService,
  callback: (tx: Prisma.TransactionClient) => Promise<T>,
  options: SerializableTransactionOptions = {},
  attempt = 0,
): Promise<T> {
  try {
    return await prisma.$transaction(callback, {
      ...options,
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    });
  } catch (error) {
    if (attempt < MAX_SERIALIZATION_RETRIES && isSerializationConflict(error)) {
      return runSerializableTransaction(prisma, callback, options, attempt + 1);
    }

    throw error;
  }
}
