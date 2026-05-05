import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { isHostedAuthMode } from '@/config/auth-mode';
import {
  getHostedApiJwtPublicKey,
  resolveHostedApiJwtConfig,
} from '@/security/api-jwt.config';
import type { RequestWithApiAuth } from '@/security/api-auth.types';

type RequestLike = RequestWithApiAuth & {
  headers?: Record<string, string | string[] | undefined>;
};

@Injectable()
export class ApiJwtGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (!isHostedAuthMode()) {
      return true;
    }

    const request = context.switchToHttp().getRequest<RequestLike>();
    const token = this.readBearerToken(request.headers?.authorization);

    if (!token) {
      throw new UnauthorizedException('Authentication is required.');
    }

    const config = resolveHostedApiJwtConfig();
    const { jwtVerify } = await import('jose');
    const result = await jwtVerify(token, getHostedApiJwtPublicKey(), {
      issuer: config.issuer,
      audience: config.audience,
      algorithms: ['ES256'],
    }).catch(() => {
      throw new UnauthorizedException('Invalid authentication token.');
    });

    if (result.protectedHeader.kid !== config.keyId) {
      throw new UnauthorizedException('Invalid authentication token.');
    }

    const subject = result.payload.sub?.trim();

    if (!subject) {
      throw new UnauthorizedException('Invalid authentication token.');
    }

    request.authPrincipal = {
      userId: subject,
      email:
        typeof result.payload.email === 'string' ? result.payload.email : null,
    };

    return true;
  }

  private readBearerToken(
    rawAuthorization: string | string[] | undefined,
  ): string | null {
    const value = Array.isArray(rawAuthorization)
      ? rawAuthorization[0]
      : rawAuthorization;

    if (typeof value !== 'string') {
      return null;
    }

    const trimmed = value.trim();

    if (!trimmed.toLowerCase().startsWith('bearer ')) {
      return null;
    }

    const token = trimmed.slice('bearer '.length).trim();
    return token || null;
  }
}
