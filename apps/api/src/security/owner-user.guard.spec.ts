import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_ROUTE_KEY } from '@/security/public-route';
import { OwnerUserGuard } from '@/security/owner-user.guard';
import { createHttpExecutionContext } from '@/testing/http-execution-context.stub';

type RequestLike = {
  authPrincipal?: {
    userId: string;
    email?: string | null;
  };
};

function createContext(
  request: RequestLike,
  handler: () => unknown = () => undefined,
) {
  return createHttpExecutionContext(request, handler);
}

describe('OwnerUserGuard', () => {
  const originalAuthMode = process.env.AUTH_MODE;

  afterAll(() => {
    if (originalAuthMode === undefined) {
      delete process.env.AUTH_MODE;
      return;
    }

    process.env.AUTH_MODE = originalAuthMode;
  });

  it('accepts the default local owner outside hosted mode without a database write', () => {
    delete process.env.AUTH_MODE;
    const guard = new OwnerUserGuard(new Reflector());

    expect(guard.canActivate(createContext({}))).toBe(true);
  });

  it('accepts the authenticated hosted user without a database write', () => {
    process.env.AUTH_MODE = 'hosted';
    const guard = new OwnerUserGuard(new Reflector());

    expect(
      guard.canActivate(
        createContext({
          authPrincipal: {
            userId: 'user-123',
            email: ' Person@Example.com ',
          },
        }),
      ),
    ).toBe(true);
  });

  it('skips owner resolution for public routes', () => {
    delete process.env.AUTH_MODE;
    const handler = () => undefined;
    Reflect.defineMetadata(IS_PUBLIC_ROUTE_KEY, true, handler);
    const guard = new OwnerUserGuard(new Reflector());

    expect(guard.canActivate(createContext({}, handler))).toBe(true);
  });
});
