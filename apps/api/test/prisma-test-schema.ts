import { loadApiEnv } from '@/config/env-loader';
import { createPrismaTestSchema as createSharedPrismaTestSchema } from '../../../test-support/disposable-prisma-schema';

export async function createPrismaTestSchema(prefix: string) {
  loadApiEnv();
  return createSharedPrismaTestSchema(prefix);
}
