import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { isLoopbackIp, resolveClientIp } from '@/security/client-ip';

@Injectable()
export class LocalOnlyGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context
      .switchToHttp()
      .getRequest<Record<string, unknown>>();
    const clientIp = resolveClientIp(request);

    if (isLoopbackIp(clientIp)) {
      return true;
    }

    throw new ForbiddenException(
      'This API is only available from loopback addresses while authentication is disabled.',
    );
  }
}
