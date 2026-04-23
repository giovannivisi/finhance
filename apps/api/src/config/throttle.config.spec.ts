import {
  THROTTLE_BUCKETS,
  createThrottlerOptions,
  resolveThrottleConfig,
} from '@/config/throttle.config';

describe('throttle.config', () => {
  it('returns the local-dev throttle limits outside production', () => {
    expect(resolveThrottleConfig({ NODE_ENV: 'development' })).toEqual({
      default: {
        limit: 1000,
        ttl: 60_000,
      },
      analytics: {
        limit: 120,
        ttl: 60_000,
      },
      imports: {
        limit: 30,
        ttl: 60_000,
      },
      operations: {
        limit: 120,
        ttl: 60_000,
      },
      marketRefresh: {
        limit: 30,
        ttl: 60_000,
      },
    });
  });

  it('returns the production throttle limits in production', () => {
    expect(resolveThrottleConfig({ NODE_ENV: 'production' })).toEqual({
      default: {
        limit: 300,
        ttl: 60_000,
      },
      analytics: {
        limit: 20,
        ttl: 60_000,
      },
      imports: {
        limit: 10,
        ttl: 60_000,
      },
      operations: {
        limit: 30,
        ttl: 60_000,
      },
      marketRefresh: {
        limit: 6,
        ttl: 60_000,
      },
    });
  });

  it('creates throttler options for every configured bucket', () => {
    expect(createThrottlerOptions({ NODE_ENV: 'production' })).toEqual([
      {
        name: THROTTLE_BUCKETS.default,
        limit: 300,
        ttl: 60_000,
      },
      {
        name: THROTTLE_BUCKETS.analytics,
        limit: 20,
        ttl: 60_000,
      },
      {
        name: THROTTLE_BUCKETS.imports,
        limit: 10,
        ttl: 60_000,
      },
      {
        name: THROTTLE_BUCKETS.operations,
        limit: 30,
        ttl: 60_000,
      },
      {
        name: THROTTLE_BUCKETS.marketRefresh,
        limit: 6,
        ttl: 60_000,
      },
    ]);
  });
});
