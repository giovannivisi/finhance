import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import {
  isLoopbackHostHeader,
  isLoopbackIp,
  resolveClientIp,
} from '@/security/client-ip';

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
  canActivate(context: ExecutionContext): boolean {
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
