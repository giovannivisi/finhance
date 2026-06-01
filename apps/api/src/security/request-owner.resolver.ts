import { Injectable } from '@nestjs/common';

export const DEFAULT_LOCAL_DEV_OWNER_ID = 'local-dev';

export function resolveLocalDevOwnerId(
  env: NodeJS.ProcessEnv = process.env,
): string {
  const ownerId = env.LOCAL_DEV_OWNER_ID?.trim();
  return ownerId || DEFAULT_LOCAL_DEV_OWNER_ID;
}

@Injectable()
export class RequestOwnerResolver {
  resolveOwnerId(): string {
    return resolveLocalDevOwnerId();
  }
}
