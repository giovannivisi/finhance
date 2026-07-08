import "server-only";

import { PrismaClient } from "@finhance/db";
import { isRetryableConnectionError } from "./prisma-retry.ts";

declare global {
  var __finhancePrisma__: PrismaClient | undefined;
}

async function sleep(delayMs: number) {
  await new Promise<void>((resolve) => {
    setTimeout(resolve, delayMs);
  });
}

async function connectWithTransientRetry(client: PrismaClient, attempts = 3) {
  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      await client.$connect();
      return;
    } catch (error) {
      lastError = error;

      if (!isRetryableConnectionError(error) || attempt === attempts) {
        throw error;
      }

      await sleep(250 * attempt);
    }
  }

  throw lastError;
}

function createPrismaClient() {
  let reconnectPromise: Promise<void> | null = null;

  const baseClient = new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

  const reconnect = async () => {
    if (reconnectPromise) {
      await reconnectPromise;
      return;
    }

    reconnectPromise = (async () => {
      try {
        await baseClient.$disconnect();
      } catch {
        // Ignore disconnect failures while recovering a stale connection.
      }

      await connectWithTransientRetry(baseClient);
    })();

    try {
      await reconnectPromise;
    } finally {
      reconnectPromise = null;
    }
  };

  return baseClient.$extends({
    query: {
      async $allOperations({ args, query }) {
        try {
          return await query(args);
        } catch (error) {
          if (!isRetryableConnectionError(error)) {
            throw error;
          }

          await reconnect();
          return query(args);
        }
      },
    },
  }) as PrismaClient;
}

function getPrismaClient() {
  const existingClient = globalThis.__finhancePrisma__;

  if (existingClient) {
    return existingClient;
  }

  const client = createPrismaClient();

  if (process.env.NODE_ENV !== "production") {
    globalThis.__finhancePrisma__ = client;
  }

  return client;
}

export const prisma = new Proxy({} as PrismaClient, {
  get(_target, property) {
    const client = getPrismaClient();
    const value = Reflect.get(client, property, client);

    return typeof value === "function" ? value.bind(client) : value;
  },
});
