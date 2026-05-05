import { createPrivateKey, generateKeyPairSync } from 'node:crypto';
import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { ApiJwtGuard } from '@/security/api-jwt.guard';

const VALID_KEY_PAIR = generateKeyPairSync('ec', {
  namedCurve: 'P-256',
  publicKeyEncoding: {
    format: 'pem',
    type: 'spki',
  },
  privateKeyEncoding: {
    format: 'pem',
    type: 'pkcs8',
  },
});

const WRONG_KEY_PAIR = generateKeyPairSync('ec', {
  namedCurve: 'P-256',
  publicKeyEncoding: {
    format: 'pem',
    type: 'spki',
  },
  privateKeyEncoding: {
    format: 'pem',
    type: 'pkcs8',
  },
});

const TEST_JWT_ENV = {
  AUTH_MODE: 'hosted',
  AUTH_API_JWT_ISSUER: 'https://web.example',
  AUTH_API_JWT_AUDIENCE: 'finhance-api',
  AUTH_API_JWT_KID: 'test-key',
  AUTH_API_JWT_PUBLIC_KEY: VALID_KEY_PAIR.publicKey,
} as const;

type RequestLike = {
  headers?: Record<string, string | string[] | undefined>;
  authPrincipal?: {
    userId: string;
    email?: string | null;
  };
};

function createContext(request: RequestLike): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as ExecutionContext;
}

describe('ApiJwtGuard', () => {
  const guard = new ApiJwtGuard();
  const originalEnv = {
    AUTH_MODE: process.env.AUTH_MODE,
    AUTH_API_JWT_ISSUER: process.env.AUTH_API_JWT_ISSUER,
    AUTH_API_JWT_AUDIENCE: process.env.AUTH_API_JWT_AUDIENCE,
    AUTH_API_JWT_KID: process.env.AUTH_API_JWT_KID,
    AUTH_API_JWT_PUBLIC_KEY: process.env.AUTH_API_JWT_PUBLIC_KEY,
  };

  beforeEach(() => {
    Object.assign(process.env, TEST_JWT_ENV);
  });

  afterAll(() => {
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) {
        delete process.env[key];
        continue;
      }

      process.env[key] = value;
    }
  });

  it('skips bearer validation in local mode', async () => {
    process.env.AUTH_MODE = 'local';

    await expect(
      guard.canActivate(
        createContext({
          headers: {},
        }),
      ),
    ).resolves.toBe(true);
  });

  it('attaches the authenticated principal from a valid token', async () => {
    const request: RequestLike = {
      headers: {
        authorization: `Bearer ${await createToken({
          subject: 'user-123',
          email: 'person@example.com',
        })}`,
      },
    };

    await expect(guard.canActivate(createContext(request))).resolves.toBe(true);
    expect(request.authPrincipal).toEqual({
      userId: 'user-123',
      email: 'person@example.com',
    });
  });

  it('rejects missing bearer tokens in hosted mode', async () => {
    await expect(
      guard.canActivate(
        createContext({
          headers: {},
        }),
      ),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('rejects tokens signed with the wrong key', async () => {
    const forgedToken = await createToken({
      subject: 'user-123',
      privateKeyPem: WRONG_KEY_PAIR.privateKey,
    });

    await expect(
      guard.canActivate(
        createContext({
          headers: {
            authorization: `Bearer ${forgedToken}`,
          },
        }),
      ),
    ).rejects.toThrow(UnauthorizedException);
  });
});

async function createToken(input: {
  subject: string;
  email?: string;
  privateKeyPem?: string;
}): Promise<string> {
  const { SignJWT } = await import('jose');
  const signingKey = createPrivateKey(
    input.privateKeyPem ?? VALID_KEY_PAIR.privateKey,
  );
  const payload = input.email ? { email: input.email } : {};

  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'ES256', kid: TEST_JWT_ENV.AUTH_API_JWT_KID })
    .setIssuer(TEST_JWT_ENV.AUTH_API_JWT_ISSUER)
    .setAudience(TEST_JWT_ENV.AUTH_API_JWT_AUDIENCE)
    .setSubject(input.subject)
    .setIssuedAt()
    .setExpirationTime('60s')
    .sign(signingKey);
}
