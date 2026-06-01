import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { loadApiEnv } from '@/config/env-loader';

const API_DIR = resolve(__dirname, '..');

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

  execFileSync('pnpm', ['exec', 'prisma', 'db', 'push', '--skip-generate'], {
    cwd: API_DIR,
    env: {
      ...process.env,
      DATABASE_URL: databaseUrl,
    },
    stdio: 'pipe',
  });

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
