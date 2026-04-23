import { shouldApplyThrottler } from '@/security/proxy-aware-throttler.guard';

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
        throttlerName: 'monthlyCashflow',
        hasExplicitThrottle: false,
      }),
    ).toBe(false);
  });

  it('applies named throttlers when the route provides throttle metadata', () => {
    expect(
      shouldApplyThrottler({
        throttlerName: 'monthlyCashflow',
        hasExplicitThrottle: true,
      }),
    ).toBe(true);
  });
});
