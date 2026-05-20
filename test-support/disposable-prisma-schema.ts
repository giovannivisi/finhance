import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { PrismaClient } from "../packages/db";

const DB_PACKAGE_DIR = resolve(__dirname, "../packages/db");
const DEFAULT_LOCAL_DEV_OWNER_ID = "local-dev";
const PLACEHOLDER_EMAIL_DOMAIN = "placeholder.local";

function buildSchemaDatabaseUrl(baseUrl: string, schema: string): string {
  const url = new URL(baseUrl);
  url.searchParams.set("schema", schema);
  return url.toString();
}

function buildOwnerPlaceholderEmail(userId: string): string {
  return `finhance-user+${userId}@${PLACEHOLDER_EMAIL_DOMAIN}`;
}

async function ensureOwnerUserRecord(
  client: PrismaClient,
  input: {
    userId: string;
    email?: string | null;
  },
): Promise<void> {
  const userId = input.userId.trim();
  const normalizedEmail = input.email?.trim().toLowerCase()
    ? input.email.trim().toLowerCase()
    : buildOwnerPlaceholderEmail(userId);

  await client.user.upsert({
    where: { id: userId },
    update: {
      email: normalizedEmail,
    },
    create: {
      id: userId,
      email: normalizedEmail,
    },
  });
}

export async function createPrismaTestSchema(
  prefix: string,
  options?: {
    baseDatabaseUrl?: string;
    ownerId?: string;
    ownerEmail?: string | null;
  },
) {
  const baseUrl = options?.baseDatabaseUrl ?? process.env.DATABASE_URL;
  if (!baseUrl) {
    throw new Error("DATABASE_URL is required for Prisma integration tests.");
  }

  const schema = `${prefix}_${randomUUID().replace(/-/g, "")}`;
  const databaseUrl = buildSchemaDatabaseUrl(baseUrl, schema);
  const adminUrl = buildSchemaDatabaseUrl(baseUrl, "public");
  const admin = new PrismaClient({
    datasources: {
      db: {
        url: adminUrl,
      },
    },
  });

  await admin.$connect();
  await admin.$executeRawUnsafe(`CREATE SCHEMA IF NOT EXISTS "${schema}"`);

  execFileSync("pnpm", ["run", "prisma:db:push", "--", "--skip-generate"], {
    cwd: DB_PACKAGE_DIR,
    env: {
      ...process.env,
      DATABASE_URL: databaseUrl,
    },
    stdio: "pipe",
  });

  const seeded = new PrismaClient({
    datasources: {
      db: {
        url: databaseUrl,
      },
    },
  });
  await seeded.$connect();
  await ensureOwnerUserRecord(seeded, {
    userId: options?.ownerId ?? DEFAULT_LOCAL_DEV_OWNER_ID,
    email: options?.ownerEmail ?? null,
  });
  await seeded.$disconnect();

  return {
    schema,
    databaseUrl,
    async dispose() {
      await admin.$executeRawUnsafe(
        `DROP SCHEMA IF EXISTS "${schema}" CASCADE`,
      );
      await admin.$disconnect();
    },
  };
}
