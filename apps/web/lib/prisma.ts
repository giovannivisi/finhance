import "server-only";

import { PrismaClient } from "@finhance/db";

declare global {
  var __finhancePrisma__: PrismaClient | undefined;
}

export const prisma =
  globalThis.__finhancePrisma__ ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalThis.__finhancePrisma__ = prisma;
}
