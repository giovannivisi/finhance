import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { config as loadEnv } from "dotenv";
import { defineConfig } from "prisma/config";

for (const envPath of [
  resolve(process.cwd(), ".env"),
  resolve(process.cwd(), "../../.env"),
]) {
  if (existsSync(envPath)) {
    loadEnv({ path: envPath, override: false });
  }
}

const ciGenerateUrl = "postgresql://prisma:prisma@localhost:5432/finhance";
const datasourceUrl =
  process.env.DATABASE_URL ?? (process.env.CI ? ciGenerateUrl : undefined);

if (!datasourceUrl) {
  throw new Error("DATABASE_URL is required for Prisma commands.");
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: datasourceUrl,
  },
});
