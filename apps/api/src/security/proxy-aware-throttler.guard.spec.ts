import {
  resolveThrottleTracker,
  shouldApplyThrottler,
} from '@/security/proxy-aware-throttler.guard';

describe('shouldApplyThrottler', () => {
  it('applies the global default throttle without explicit route metadata', () => {
    expect(
      shouldApplyThrottler({
        throttlerName: 'default',
        hasExplicitThrottle: false,
      }),
    ).toBe(true);
  });

  it('skips named throttlers unless the route opts in', () => {
    expect(
      shouldApplyThrottler({
        throttlerName: 'analytics',
        hasExplicitThrottle: false,
      }),
    ).toBe(false);
  });

  it('applies named throttlers when the route provides throttle metadata', () => {
    expect(
      shouldApplyThrottler({
        throttlerName: 'imports',
        hasExplicitThrottle: true,
      }),
    ).toBe(true);
  });
});

describe('resolveThrottleTracker', () => {
  it('keys authenticated requests on the principal user id', () => {
    expect(
      resolveThrottleTracker({
        authPrincipal: { userId: 'user-123', email: null },
        ip: '203.0.113.10',
      }),
    ).toBe('user:user-123');
  });

  it('falls back to the client ip without an authenticated principal', () => {
    expect(
      resolveThrottleTracker({
        ip: '203.0.113.10',
      }),
    ).toBe('203.0.113.10');
  });

  it('ignores principals with blank user ids', () => {
    expect(
      resolveThrottleTracker({
        authPrincipal: { userId: '   ', email: null },
        ip: '203.0.113.10',
      }),
    ).toBe('203.0.113.10');
  });
});
