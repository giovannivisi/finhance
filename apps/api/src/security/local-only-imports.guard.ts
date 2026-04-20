import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { isLoopbackHost, normalizeHost } from '@/config/bootstrap.config';
import { resolveClientIp } from '@/security/client-ip';

type RequestLike = {
  headers?: Record<string, string | string[] | undefined>;
  ips?: unknown;
  ip?: unknown;
  socket?: {
    remoteAddress?: unknown;
  } | null;
};

@Injectable()
export class LocalOnlyImportsGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<RequestLike>();
    const clientIp = resolveClientIp(request);

    if (!this.isLoopbackIp(clientIp)) {
      throw new ForbiddenException(
        'Import routes are available only from loopback clients.',
      );
    }

    const origin = this.readHeader(request, 'origin');
    const referer = this.readHeader(request, 'referer');
    const browserOrigin = origin ?? this.toOrigin(referer);

    if (browserOrigin && !this.isLoopbackOrigin(browserOrigin)) {
      throw new ForbiddenException(
        'Import routes reject non-local browser origins.',
      );
    }

    return true;
  }

  private readHeader(request: RequestLike, name: string): string | undefined {
    const header = request.headers?.[name];

    if (Array.isArray(header)) {
      return header[0];
    }

    return typeof header === 'string' ? header : undefined;
  }

  private toOrigin(value: string | undefined): string | null {
    if (!value) {
      return null;
    }

    try {
      return new URL(value).origin;
    } catch {
      return null;
    }
  }

  private isLoopbackOrigin(origin: string): boolean {
    try {
      return isLoopbackHost(normalizeHost(new URL(origin).hostname));
    } catch {
      return false;
    }
  }

  private isLoopbackIp(ip: string): boolean {
    return (
      ip === '127.0.0.1' ||
      ip === '::1' ||
      ip === '::ffff:127.0.0.1' ||
      ip === 'localhost'
    );
  }
}
