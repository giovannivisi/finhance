import {
  Inject,
  Injectable,
  Scope,
  UnauthorizedException,
} from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import { isHostedAuthMode } from '@/config/auth-mode';
import type {
  ApiAuthPrincipal,
  RequestWithApiAuth,
} from '@/security/api-auth.types';

export const DEFAULT_LOCAL_DEV_OWNER_ID = 'local-dev';

export function resolveLocalDevOwnerId(
  env: NodeJS.ProcessEnv = process.env,
): string {
  const ownerId = env.LOCAL_DEV_OWNER_ID?.trim();
  return ownerId || DEFAULT_LOCAL_DEV_OWNER_ID;
}

export function resolveAuthenticatedOwnerId(
  principal: ApiAuthPrincipal | undefined,
): string {
  const ownerId = principal?.userId?.trim();

  if (!ownerId) {
    throw new UnauthorizedException('Authenticated user is required.');
  }

  return ownerId;
}

export function resolveRequestOwnerId(
  request: RequestWithApiAuth,
  env: NodeJS.ProcessEnv = process.env,
): string {
  if (!isHostedAuthMode(env)) {
    return resolveLocalDevOwnerId(env);
  }

  return resolveAuthenticatedOwnerId(request.authPrincipal);
}

@Injectable({ scope: Scope.REQUEST })
export class RequestOwnerResolver {
  constructor(@Inject(REQUEST) private readonly request: RequestWithApiAuth) {}

  resolveOwnerId(env: NodeJS.ProcessEnv = process.env): string {
    return resolveRequestOwnerId(this.request, env);
  }
}
