import { Injectable } from '@nestjs/common';
import { ExecutionContext } from '@nestjs/common';
import {
  ThrottlerGuard,
  type ThrottlerGenerateKeyFunction,
  type ThrottlerGetTrackerFunction,
} from '@nestjs/throttler';
import { resolveClientIp } from '@/security/client-ip';

const THROTTLER_SKIP = 'THROTTLER:SKIP';
const THROTTLER_LIMIT = 'THROTTLER:LIMIT';
const THROTTLER_TTL = 'THROTTLER:TTL';
const THROTTLER_BLOCK_DURATION = 'THROTTLER:BLOCK_DURATION';
const THROTTLER_TRACKER = 'THROTTLER:TRACKER';
const THROTTLER_KEY_GENERATOR = 'THROTTLER:KEY_GENERATOR';

type ThrottleNumeric =
  | number
  | ((context: ExecutionContext) => number | Promise<number>);

@Injectable()
export class ProxyAwareThrottlerGuard extends ThrottlerGuard {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const handler = context.getHandler();
    const classRef = context.getClass();

    if (await this.shouldSkip(context)) {
      return true;
    }

    const decisions = await Promise.all(
      this.throttlers.map(async (namedThrottler) => {
        const suffix = namedThrottler.name;
        const skip = this.reflector.getAllAndOverride<boolean | undefined>(
          THROTTLER_SKIP + suffix,
          [handler, classRef],
        );
        if (skip) {
          return true;
        }

        const routeOrClassLimit = this.reflector.getAllAndOverride<
          ThrottleNumeric | undefined
        >(THROTTLER_LIMIT + suffix, [handler, classRef]);
        const routeOrClassTtl = this.reflector.getAllAndOverride<
          ThrottleNumeric | undefined
        >(THROTTLER_TTL + suffix, [handler, classRef]);
        const routeOrClassBlockDuration = this.reflector.getAllAndOverride<
          ThrottleNumeric | undefined
        >(THROTTLER_BLOCK_DURATION + suffix, [handler, classRef]);
        const routeOrClassGetTracker = this.reflector.getAllAndOverride<
          ThrottlerGetTrackerFunction | undefined
        >(THROTTLER_TRACKER + suffix, [handler, classRef]);
        const routeOrClassGetKeyGenerator = this.reflector.getAllAndOverride<
          ThrottlerGenerateKeyFunction | undefined
        >(THROTTLER_KEY_GENERATOR + suffix, [handler, classRef]);
        const hasExplicitThrottle =
          routeOrClassLimit !== undefined ||
          routeOrClassTtl !== undefined ||
          routeOrClassBlockDuration !== undefined ||
          routeOrClassGetTracker !== undefined ||
          routeOrClassGetKeyGenerator !== undefined;

        if (!hasExplicitThrottle) {
          return true;
        }

        const limit = await this.resolveThrottleValue(
          context,
          routeOrClassLimit ?? namedThrottler.limit,
        );
        const ttl = await this.resolveThrottleValue(
          context,
          routeOrClassTtl ?? namedThrottler.ttl,
        );
        const blockDuration = await this.resolveThrottleValue(
          context,
          routeOrClassBlockDuration ?? namedThrottler.blockDuration ?? ttl,
        );
        const getTracker: ThrottlerGetTrackerFunction =
          routeOrClassGetTracker ??
          namedThrottler.getTracker ??
          this.commonOptions.getTracker ??
          ((req) => this.getTracker(req));
        const generateKey: ThrottlerGenerateKeyFunction =
          routeOrClassGetKeyGenerator ??
          namedThrottler.generateKey ??
          this.commonOptions.generateKey ??
          ((ctx, tracker, name) => this.generateKey(ctx, tracker, name));

        return this.handleRequest({
          context,
          throttler: namedThrottler,
          limit,
          ttl,
          blockDuration,
          getTracker,
          generateKey,
        });
      }),
    );

    return decisions.every(Boolean);
  }

  protected getTracker(req: Record<string, unknown>): Promise<string> {
    return Promise.resolve(resolveClientIp(req));
  }

  private async resolveThrottleValue<T>(
    context: ExecutionContext,
    value: T | ((context: ExecutionContext) => Promise<T> | T),
  ): Promise<T> {
    return typeof value === 'function'
      ? (value as (context: ExecutionContext) => Promise<T> | T)(context)
      : value;
  }
}
