import { generateKeyPairSync } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { Prisma, PrismaClient } from '@finhance/db';
import type { UserSettingsResponse } from '@finhance/shared';
import { AppModule } from '@/app.module';
import { createPrismaTestSchema } from './prisma-test-schema';

const OWNER_ID = 'local-dev';
const HOSTED_USER_ID = 'hosted-user-1';
jest.setTimeout(90_000);

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

type HttpServer = Parameters<typeof request>[0];

function bodyAs<T>(response: { body: unknown }): T {
  return response.body as T;
}

function configureHostedJwtEnv() {
  process.env.AUTH_MODE = 'hosted';
  process.env.AUTH_API_JWT_ISSUER = 'https://web.example';
  process.env.AUTH_API_JWT_AUDIENCE = 'finhance-api';
  process.env.AUTH_API_JWT_KID = 'test-key';
  process.env.AUTH_API_JWT_PUBLIC_KEY = TEST_KEY_PAIR.publicKey;
}

async function createHostedAuthToken(input: {
  userId: string;
  email?: string | null;
}): Promise<string> {
  const { importPKCS8, SignJWT } = await import('jose');
  const key = await importPKCS8(TEST_KEY_PAIR.privateKey, 'ES256');
  const payload: Record<string, string> = {};
  if (input.email) {
    payload.email = input.email;
  }

  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'ES256', kid: 'test-key' })
    .setIssuer('https://web.example')
    .setAudience('finhance-api')
    .setSubject(input.userId)
    .setIssuedAt()
    .setExpirationTime('60s')
    .sign(key);
}

describe('User settings routes (e2e)', () => {
  const originalEnv = {
    AUTH_MODE: process.env.AUTH_MODE,
    AUTH_API_JWT_ISSUER: process.env.AUTH_API_JWT_ISSUER,
    AUTH_API_JWT_AUDIENCE: process.env.AUTH_API_JWT_AUDIENCE,
    AUTH_API_JWT_KID: process.env.AUTH_API_JWT_KID,
    AUTH_API_JWT_PUBLIC_KEY: process.env.AUTH_API_JWT_PUBLIC_KEY,
    DATABASE_URL: process.env.DATABASE_URL,
  };

  afterAll(() => {
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });

  describe('local mode owner resolution', () => {
    let app: INestApplication;
    let prisma: PrismaClient;
    let disposeSchema: (() => Promise<void>) | undefined;

    function httpServer(): HttpServer {
      return app.getHttpServer() as HttpServer;
    }

    beforeAll(async () => {
      const schema = await createPrismaTestSchema('user_settings_local');
      disposeSchema = async () => schema.dispose();
      process.env.DATABASE_URL = schema.databaseUrl;
      process.env.AUTH_MODE = 'local';

      const moduleFixture: TestingModule = await Test.createTestingModule({
        imports: [AppModule],
      }).compile();

      app = moduleFixture.createNestApplication();
      app.useGlobalPipes(
        new ValidationPipe({
          whitelist: true,
          forbidNonWhitelisted: true,
          transform: true,
        }),
      );
      await app.init();

      prisma = new PrismaClient();
      await prisma.$connect();
    });

    afterAll(async () => {
      await app?.close();
      await prisma?.$disconnect();
      await disposeSchema?.();
    });

    beforeEach(async () => {
      await prisma.user.update({
        where: { id: OWNER_ID },
        data: { userSettings: Prisma.DbNull },
      });
    });

    it('returns default settings and saves partial updates', async () => {
      const getResponse = await request(httpServer())
        .get('/users/me/settings')
        .expect(200);

      expect(bodyAs<UserSettingsResponse>(getResponse)).toEqual({
        cloudParserAvailable: false,
        cloudParserConsentVersion: null,
        cloudParserEnabled: false,
        reportingCurrency: 'EUR',
        showTransactionTimes: true,
        startPage: 'DASHBOARD',
      });

      const patchResponse = await request(httpServer())
        .patch('/users/me/settings')
        .set('Idempotency-Key', 'user-settings-local')
        .send({
          showTransactionTimes: false,
          startPage: 'BROKERAGE',
        })
        .expect(200);

      expect(bodyAs<UserSettingsResponse>(patchResponse)).toEqual({
        cloudParserAvailable: false,
        cloudParserConsentVersion: null,
        cloudParserEnabled: false,
        reportingCurrency: 'EUR',
        showTransactionTimes: false,
        startPage: 'BROKERAGE',
      });

      const persisted = await prisma.user.findUniqueOrThrow({
        where: { id: OWNER_ID },
        select: { userSettings: true },
      });
      expect(persisted.userSettings).toEqual({
        cloudParserEnabled: false,
        reportingCurrency: 'EUR',
        showTransactionTimes: false,
        startPage: 'BROKERAGE',
      });
    });

    it('rejects invalid start pages', async () => {
      await request(httpServer())
        .patch('/users/me/settings')
        .set('Idempotency-Key', 'user-settings-invalid-start-page')
        .send({ startPage: 'IMPORT' })
        .expect(400);
    });
  });

  describe('hosted mode owner resolution', () => {
    let app: INestApplication;
    let prisma: PrismaClient;
    let disposeSchema: (() => Promise<void>) | undefined;

    function httpServer(): HttpServer {
      return app.getHttpServer() as HttpServer;
    }

    beforeAll(async () => {
      const schema = await createPrismaTestSchema('user_settings_hosted');
      disposeSchema = async () => schema.dispose();
      process.env.DATABASE_URL = schema.databaseUrl;
      configureHostedJwtEnv();

      const moduleFixture: TestingModule = await Test.createTestingModule({
        imports: [AppModule],
      }).compile();

      app = moduleFixture.createNestApplication();
      app.useGlobalPipes(
        new ValidationPipe({
          whitelist: true,
          forbidNonWhitelisted: true,
          transform: true,
        }),
      );
      await app.init();

      prisma = new PrismaClient();
      await prisma.$connect();
    });

    afterAll(async () => {
      await app?.close();
      await prisma?.$disconnect();
      await disposeSchema?.();
    });

    it('uses the authenticated hosted user record', async () => {
      const token = await createHostedAuthToken({
        userId: HOSTED_USER_ID,
        email: 'giovanni@example.com',
      });

      const response = await request(httpServer())
        .patch('/users/me/settings')
        .set('Authorization', `Bearer ${token}`)
        .set('Idempotency-Key', 'user-settings-hosted')
        .send({ startPage: 'ANALYTICS' })
        .expect(200);

      expect(bodyAs<UserSettingsResponse>(response)).toEqual({
        cloudParserAvailable: false,
        cloudParserConsentVersion: null,
        cloudParserEnabled: false,
        reportingCurrency: 'EUR',
        showTransactionTimes: true,
        startPage: 'ANALYTICS',
      });

      const hostedUser = await prisma.user.findUniqueOrThrow({
        where: { id: HOSTED_USER_ID },
      });
      expect(hostedUser.email).toBe('giovanni@example.com');
      expect(hostedUser.userSettings).toEqual({
        cloudParserEnabled: false,
        reportingCurrency: 'EUR',
        showTransactionTimes: true,
        startPage: 'ANALYTICS',
      });
    });
  });
});
