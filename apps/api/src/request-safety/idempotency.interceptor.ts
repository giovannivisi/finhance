import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { lastValueFrom, from, type Observable } from 'rxjs';
import { defaultIfEmpty } from 'rxjs/operators';
import { resolveLocalDevOwnerId } from '@/security/request-owner.resolver';
import { IdempotencyService } from '@/request-safety/idempotency.service';

type HttpRequest = {
  method?: string;
  headers?: Record<string, string | string[] | undefined>;
  params?: Record<string, unknown>;
  query?: Record<string, unknown>;
  body?: unknown;
  baseUrl?: string;
  route?: {
    path?: string;
  };
};

type HttpResponse = {
  statusCode: number;
  status(code: number): HttpResponse;
};

@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(private readonly idempotencyService: IdempotencyService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') {
      return next.handle();
    }

    const http = context.switchToHttp();
    const request = http.getRequest<HttpRequest>();
    const response = http.getResponse<HttpResponse>();

    if (!this.shouldHandle(request)) {
      return next.handle();
    }

    const method = request.method?.toUpperCase() ?? 'POST';
    const routePath = this.normalizeRoutePath(
      request.baseUrl,
      request.route?.path,
    );
    const idempotencyKey = request.headers?.['idempotency-key'];

    return from(
      this.idempotencyService
        .executeJson({
          userId: resolveLocalDevOwnerId(),
          method,
          routePath,
          idempotencyKey,
          fingerprint: {
            params: request.params ?? {},
            query: request.query ?? {},
            body: request.body ?? null,
          },
          handler: async () => {
            const body: unknown = await lastValueFrom(
              next.handle().pipe(defaultIfEmpty(undefined)),
            );

            return {
              statusCode: response.statusCode,
              body,
            };
          },
        })
        .then((result): unknown => {
          response.status(result.statusCode);
          return result.body;
        }),
    );
  }

  private shouldHandle(request: HttpRequest): boolean {
    const method = request.method?.toUpperCase();

    if (!method || !['POST', 'PUT', 'DELETE'].includes(method)) {
      return false;
    }

    const normalizedRoutePath = this.normalizeRoutePath(
      request.baseUrl,
      request.route?.path,
    );
    const contentType = request.headers?.['content-type'];
    const normalizedContentType = Array.isArray(contentType)
      ? contentType[0]?.toLowerCase()
      : contentType?.toLowerCase();

    if (normalizedContentType?.includes('multipart/form-data')) {
      return false;
    }

    return normalizedRoutePath !== '/imports/csv/export';
  }

  private normalizeRoutePath(
    baseUrl: string | undefined,
    routePath: string | undefined,
  ): string {
    const joined = [baseUrl, routePath]
      .filter((part) => !!part)
      .join('/')
      .replace(/\/+/g, '/');
    const normalized = joined.startsWith('/') ? joined : `/${joined}`;

    if (normalized.length > 1 && normalized.endsWith('/')) {
      return normalized.slice(0, -1);
    }

    return normalized || '/';
  }
}
