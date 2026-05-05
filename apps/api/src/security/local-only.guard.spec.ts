import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { LocalOnlyGuard } from '@/security/local-only.guard';
import { IS_PUBLIC_ROUTE_KEY } from '@/security/public-route';

function createContext(
  request: Record<string, unknown>,
  handler: () => unknown = () => undefined,
): ExecutionContext {
  const classRef = class TestController {};

  return {
    getClass: () => classRef,
    getHandler: () => handler,
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as ExecutionContext;
}

describe('LocalOnlyGuard', () => {
  const guard = new LocalOnlyGuard(new Reflector());
  const originalAuthMode = process.env.AUTH_MODE;

  beforeEach(() => {
    delete process.env.AUTH_MODE;
  });

  afterAll(() => {
    if (originalAuthMode === undefined) {
      delete process.env.AUTH_MODE;
      return;
    }

    process.env.AUTH_MODE = originalAuthMode;
  });

  it('allows loopback requests with a loopback host header', () => {
    expect(
      guard.canActivate(
        createContext({
          ip: '127.0.0.1',
          headers: { host: '127.0.0.1:3000' },
        }),
      ),
    ).toBe(true);
  });

  it('allows localhost host header', () => {
    expect(
      guard.canActivate(
        createContext({
          ip: '127.0.0.1',
          headers: { host: 'localhost:3000' },
        }),
      ),
    ).toBe(true);
  });

  it('allows IPv6 loopback host header', () => {
    expect(
      guard.canActivate(
        createContext({
          ip: '::1',
          headers: { host: '[::1]:3000' },
        }),
      ),
    ).toBe(true);
  });

  it('rejects non-loopback IP', () => {
    expect(() =>
      guard.canActivate(
        createContext({
          ip: '198.51.100.10',
          headers: { host: '127.0.0.1:3000' },
        }),
      ),
    ).toThrow(ForbiddenException);
  });

  it('rejects non-loopback host header (DNS rebinding)', () => {
    expect(() =>
      guard.canActivate(
        createContext({
          ip: '127.0.0.1',
          headers: { host: 'attacker.com' },
        }),
      ),
    ).toThrow(ForbiddenException);
  });

  it('rejects missing host header', () => {
    expect(() =>
      guard.canActivate(
        createContext({
          ip: '127.0.0.1',
          headers: {},
        }),
      ),
    ).toThrow(ForbiddenException);
  });

  it('skips loopback enforcement in hosted mode', () => {
    process.env.AUTH_MODE = 'hosted';

    expect(
      guard.canActivate(
        createContext({
          ip: '198.51.100.10',
          headers: { host: 'finhance.example' },
        }),
      ),
    ).toBe(true);
  });

  it('allows public routes without loopback enforcement', () => {
    const handler = () => undefined;
    Reflect.defineMetadata(IS_PUBLIC_ROUTE_KEY, true, handler);

    expect(
      guard.canActivate(
        createContext(
          {
            ip: '198.51.100.10',
            headers: { host: 'finhance.example' },
          },
          handler,
        ),
      ),
    ).toBe(true);
  });
});
