import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { PrismaClient } from '@finhance/db';
import { loadApiEnv } from '@/config/env-loader';
import { ensureOwnerUserRecord } from '@/security/owner-user';
import { DEFAULT_LOCAL_DEV_OWNER_ID } from '@/security/request-owner.resolver';

const API_DIR = resolve(__dirname, '..');
const DB_PACKAGE_DIR = resolve(API_DIR, '../../packages/db');

function buildSchemaDatabaseUrl(baseUrl: string, schema: string): string {
  const url = new URL(baseUrl);
  url.searchParams.set('schema', schema);
  return url.toString();
}

export async function createPrismaTestSchema(prefix: string) {
  loadApiEnv();

  const baseUrl = process.env.DATABASE_URL;
  if (!baseUrl) {
    throw new Error('DATABASE_URL is required for Prisma integration tests.');
  }

  const schema = `${prefix}_${randomUUID().replace(/-/g, '')}`;
  const databaseUrl = buildSchemaDatabaseUrl(baseUrl, schema);
  const adminUrl = buildSchemaDatabaseUrl(baseUrl, 'public');
  const admin = new PrismaClient({
    datasources: {
      db: {
        url: adminUrl,
      },
    },
  });

  await admin.$connect();
  await admin.$executeRawUnsafe(`CREATE SCHEMA IF NOT EXISTS "${schema}"`);

  execFileSync('pnpm', ['run', 'prisma:db:push', '--', '--skip-generate'], {
    cwd: DB_PACKAGE_DIR,
    env: {
      ...process.env,
      DATABASE_URL: databaseUrl,
    },
    stdio: 'pipe',
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
    userId: DEFAULT_LOCAL_DEV_OWNER_ID,
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
