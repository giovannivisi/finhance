import type {
  Resolvable,
  ThrottlerModuleOptions,
  ThrottlerOptions,
} from '@nestjs/throttler';

export const THROTTLE_BUCKETS = {
  default: 'default',
  analytics: 'analytics',
  imports: 'imports',
  operations: 'operations',
  marketRefresh: 'marketRefresh',
} as const;

export type ThrottleBucketName =
  (typeof THROTTLE_BUCKETS)[keyof typeof THROTTLE_BUCKETS];

interface ThrottleBucketConfig {
  limit: number;
  ttl: number;
}

export type ThrottleBucketConfigMap = Record<
  ThrottleBucketName,
  ThrottleBucketConfig
>;

const ONE_MINUTE_MS = 60_000;

const LOCAL_DEV_THROTTLE_CONFIG: ThrottleBucketConfigMap = {
  default: {
    limit: 1000,
    ttl: ONE_MINUTE_MS,
  },
  analytics: {
    limit: 120,
    ttl: ONE_MINUTE_MS,
  },
  imports: {
    limit: 30,
    ttl: ONE_MINUTE_MS,
  },
  operations: {
    limit: 120,
    ttl: ONE_MINUTE_MS,
  },
  marketRefresh: {
    limit: 30,
    ttl: ONE_MINUTE_MS,
  },
};

const PRODUCTION_THROTTLE_CONFIG: ThrottleBucketConfigMap = {
  default: {
    limit: 300,
    ttl: ONE_MINUTE_MS,
  },
  analytics: {
    limit: 20,
    ttl: ONE_MINUTE_MS,
  },
  imports: {
    limit: 10,
    ttl: ONE_MINUTE_MS,
  },
  operations: {
    limit: 30,
    ttl: ONE_MINUTE_MS,
  },
  marketRefresh: {
    limit: 6,
    ttl: ONE_MINUTE_MS,
  },
};

function isProductionEnvironment(env: NodeJS.ProcessEnv): boolean {
  return env.NODE_ENV === 'production';
}

export function resolveThrottleConfig(
  env: NodeJS.ProcessEnv = process.env,
): ThrottleBucketConfigMap {
  return isProductionEnvironment(env)
    ? PRODUCTION_THROTTLE_CONFIG
    : LOCAL_DEV_THROTTLE_CONFIG;
}

export function createThrottlerOptions(
  env: NodeJS.ProcessEnv = process.env,
): ThrottlerModuleOptions {
  const config = resolveThrottleConfig(env);

  return [
    createThrottlerOption(THROTTLE_BUCKETS.default, config.default),
    createThrottlerOption(THROTTLE_BUCKETS.analytics, config.analytics),
    createThrottlerOption(THROTTLE_BUCKETS.imports, config.imports),
    createThrottlerOption(THROTTLE_BUCKETS.operations, config.operations),
    createThrottlerOption(THROTTLE_BUCKETS.marketRefresh, config.marketRefresh),
  ];
}

export function createNamedThrottleOverride<
  TBucket extends Exclude<ThrottleBucketName, 'default'>,
>(
  bucket: TBucket,
): Record<
  TBucket,
  {
    limit: Resolvable<number>;
    ttl: Resolvable<number>;
  }
> {
  const override = {
    limit: () => resolveThrottleConfig()[bucket].limit,
    ttl: () => resolveThrottleConfig()[bucket].ttl,
  };

  return {
    [bucket]: override,
  } as unknown as Record<
    TBucket,
    {
      limit: Resolvable<number>;
      ttl: Resolvable<number>;
    }
  >;
}

function createThrottlerOption(
  name: ThrottleBucketName,
  config: ThrottleBucketConfig,
): ThrottlerOptions {
  return {
    name,
    limit: config.limit,
    ttl: config.ttl,
  };
}
