import { APP_GUARD } from '@nestjs/core';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { generateKeyPairSync } from 'node:crypto';
import { AppController } from '@/app.controller';
import { AppService } from '@/app.service';
import { ApiJwtGuard } from '@/security/api-jwt.guard';
import { LocalOnlyGuard } from '@/security/local-only.guard';

type HealthResponse = {
  status: string;
  service: string;
  authMode: string;
  timestamp: string;
};

type RequestTarget = Parameters<typeof request>[0];

const TEST_KEY_PAIR = generateKeyPairSync('ec', {
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

describe('Health route (e2e)', () => {
  let app: INestApplication;
  const originalEnv = {
    AUTH_MODE: process.env.AUTH_MODE,
    AUTH_API_JWT_ISSUER: process.env.AUTH_API_JWT_ISSUER,
    AUTH_API_JWT_AUDIENCE: process.env.AUTH_API_JWT_AUDIENCE,
    AUTH_API_JWT_KID: process.env.AUTH_API_JWT_KID,
    AUTH_API_JWT_PUBLIC_KEY: process.env.AUTH_API_JWT_PUBLIC_KEY,
  };

  beforeEach(async () => {
    process.env.AUTH_MODE = 'hosted';
    process.env.AUTH_API_JWT_ISSUER = 'https://web.example';
    process.env.AUTH_API_JWT_AUDIENCE = 'finhance-api';
    process.env.AUTH_API_JWT_KID = 'test-key';
    process.env.AUTH_API_JWT_PUBLIC_KEY = TEST_KEY_PAIR.publicKey;

    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [
        AppService,
        {
          provide: APP_GUARD,
          useClass: LocalOnlyGuard,
        },
        {
          provide: APP_GUARD,
          useClass: ApiJwtGuard,
        },
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
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

  it('allows anonymous access to /health in hosted mode', async () => {
    const response = await request(app.getHttpServer() as RequestTarget).get(
      '/health',
    );
    const body = response.body as HealthResponse;

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      status: 'ok',
      service: 'api',
      authMode: 'hosted',
    });
    expect(typeof body.timestamp).toBe('string');
  });

  it('still rejects anonymous access to protected routes', async () => {
    const response = await request(app.getHttpServer() as RequestTarget).get(
      '/',
    );

    expect(response.status).toBe(401);
  });
});
