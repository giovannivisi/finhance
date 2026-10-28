import { Prisma } from "@finhance/db";

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
        "Timed out fetching a new connection from the connection pool.",
      )
    );
  }

  if (error instanceof Prisma.PrismaClientUnknownRequestError) {
    return error.message.includes("Response from the Engine was empty");
  }

  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    (error.code === "P1001" ||
      error.code === "P2024" ||
      (error.code === "P2028" &&
        error.message.includes(
          "Unable to start a transaction in the given time.",
        )))
  );
}

const READ_OPERATIONS = new Set([
  "findUnique",
  "findUniqueOrThrow",
  "findFirst",
  "findFirstOrThrow",
  "findMany",
  "aggregate",
  "count",
  "groupBy",
]);

export function shouldRetryPrismaOperation(
  operation: string,
  error: unknown,
): boolean {
  if (!isRetryableConnectionError(error)) {
    return false;
  }

  if (error instanceof Prisma.PrismaClientUnknownRequestError) {
    return READ_OPERATIONS.has(operation);
  }

  return true;
}
