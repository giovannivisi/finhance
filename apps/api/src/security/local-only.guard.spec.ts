import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { LocalOnlyGuard } from '@/security/local-only.guard';

function createContext(request: Record<string, unknown>): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as ExecutionContext;
}

describe('LocalOnlyGuard', () => {
  const guard = new LocalOnlyGuard();

  it('allows loopback requests', () => {
    expect(
      guard.canActivate(
        createContext({
          ip: '127.0.0.1',
        }),
      ),
    ).toBe(true);
  });

  it('rejects non-loopback requests', () => {
    expect(() =>
      guard.canActivate(
        createContext({
          ip: '198.51.100.10',
        }),
      ),
    ).toThrow(ForbiddenException);
  });
});
