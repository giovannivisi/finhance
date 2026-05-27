import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { RequestWithApiAuth } from '@/security/api-auth.types';
import { isPublicRoute } from '@/security/public-route';
import { resolveRequestOwnerId } from '@/security/request-owner.resolver';

@Injectable()
export class OwnerUserGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    if (isPublicRoute(context, this.reflector)) {
      return true;
    }

    const request = context.switchToHttp().getRequest<RequestWithApiAuth>();
    resolveRequestOwnerId(request);

    return true;
  }
}
