import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  isLoopbackHostHeader,
  isLoopbackIp,
  resolveClientIp,
} from '@/security/client-ip';
import { isHostedAuthMode } from '@/config/auth-mode';
import { isPublicRoute } from '@/security/public-route';

type RequestLike = {
  ips?: unknown;
  ip?: unknown;
  socket?: {
    remoteAddress?: unknown;
  } | null;
  headers?: Record<string, string | string[] | undefined>;
};

@Injectable()
export class LocalOnlyGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    if (isPublicRoute(context, this.reflector)) {
      return true;
    }

    if (isHostedAuthMode()) {
      return true;
    }

    const request = context.switchToHttp().getRequest<RequestLike>();
    const clientIp = resolveClientIp(request);

    if (!isLoopbackIp(clientIp)) {
      throw new ForbiddenException(
        'This API is only available from loopback addresses while authentication is disabled.',
      );
    }

    if (!isLoopbackHostHeader(request.headers?.host)) {
      throw new ForbiddenException(
        'This API rejects requests with non-loopback Host headers.',
      );
    }

    return true;
  }
}
