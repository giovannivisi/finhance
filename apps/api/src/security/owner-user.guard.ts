import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '@prisma/prisma.service';
import type { RequestWithApiAuth } from '@/security/api-auth.types';
import { ensureOwnerUserRecord } from '@/security/owner-user';
import { isPublicRoute } from '@/security/public-route';
import { resolveRequestOwnerId } from '@/security/request-owner.resolver';

@Injectable()
export class OwnerUserGuard implements CanActivate {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (isPublicRoute(context, this.reflector)) {
      return true;
    }

    const request = context.switchToHttp().getRequest<RequestWithApiAuth>();
    const ownerId = resolveRequestOwnerId(request);

    await ensureOwnerUserRecord(this.prisma, {
      userId: ownerId,
      email: request.authPrincipal?.email ?? null,
    });

    return true;
  }
}
