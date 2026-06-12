import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_ROUTE_KEY } from '@/security/public-route';
import { OwnerUserGuard } from '@/security/owner-user.guard';
import { buildOwnerPlaceholderEmail } from '@/security/owner-user';
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

  it('creates the default local owner outside hosted mode', async () => {
    delete process.env.AUTH_MODE;
    const upsert = jest.fn().mockResolvedValue({ isActive: true });
    const guard = new OwnerUserGuard(
      {
        user: {
          upsert,
        },
      } as never,
      new Reflector(),
    );

    await expect(guard.canActivate(createContext({}))).resolves.toBe(true);
    expect(upsert).toHaveBeenCalledWith({
      where: { id: 'local-dev' },
      update: {},
      create: {
        id: 'local-dev',
        email: buildOwnerPlaceholderEmail('local-dev'),
      },
      select: { isActive: true },
    });
  });

  it('upserts the authenticated hosted user record', async () => {
    process.env.AUTH_MODE = 'hosted';
    const upsert = jest.fn().mockResolvedValue({ isActive: true });
    const guard = new OwnerUserGuard(
      {
        user: {
          upsert,
        },
      } as never,
      new Reflector(),
    );

    await expect(
      guard.canActivate(
        createContext({
          authPrincipal: {
            userId: 'user-123',
            email: ' Person@Example.com ',
          },
        }),
      ),
    ).resolves.toBe(true);
    expect(upsert).toHaveBeenCalledWith({
      where: { id: 'user-123' },
      update: {
        email: 'person@example.com',
      },
      create: {
        id: 'user-123',
        email: 'person@example.com',
      },
      select: { isActive: true },
    });
  });

  it('rejects inactive hosted users', async () => {
    process.env.AUTH_MODE = 'hosted';
    const upsert = jest.fn().mockResolvedValue({ isActive: false });
    const guard = new OwnerUserGuard(
      {
        user: {
          upsert,
        },
      } as never,
      new Reflector(),
    );

    await expect(
      guard.canActivate(
        createContext({
          authPrincipal: {
            userId: 'user-123',
            email: 'person@example.com',
          },
        }),
      ),
    ).rejects.toThrow('This user account is disabled.');
  });

  it('skips owner upserts for public routes', async () => {
    delete process.env.AUTH_MODE;
    const upsert = jest.fn().mockResolvedValue({ isActive: true });
    const handler = () => undefined;
    Reflect.defineMetadata(IS_PUBLIC_ROUTE_KEY, true, handler);
    const guard = new OwnerUserGuard(
      {
        user: {
          upsert,
        },
      } as never,
      new Reflector(),
    );

    await expect(guard.canActivate(createContext({}, handler))).resolves.toBe(
      true,
    );
    expect(upsert).not.toHaveBeenCalled();
  });
});
