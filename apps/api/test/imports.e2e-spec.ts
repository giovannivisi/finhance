import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { LocalOnlyImportsGuard } from '@/security/local-only-imports.guard';
import { ImportsController } from '@imports/imports.controller';
import { ImportsService } from '@imports/imports.service';
import { PricesService } from '@prices/prices.service';
import { PrismaService } from '@prisma/prisma.service';
import { RequestOwnerResolver } from '@/security/request-owner.resolver';
import { IdempotencyService } from '@/request-safety/idempotency.service';
import { AccountType, ImportBatchStatus, ImportSource } from '@prisma/client';

const OWNER_ID = 'local-dev';
type ResponseWithBody = { body: unknown };
type HttpServer = Parameters<typeof request>[0];

function bodyAs<T>(response: ResponseWithBody): T {
  return response.body as T;
}

function createImportBatch(
  overrides: Partial<Record<string, unknown>> = {},
): Record<string, unknown> {
  return {
    id: 'batch-1',
    userId: OWNER_ID,
    source: ImportSource.CSV_TEMPLATE,
    status: ImportBatchStatus.PREVIEW,
    summaryJson: { files: [], errorCount: 0, warningCount: 0 },
    errorJson: [],
    payloadJson: null,
    createdAt: new Date('2026-04-19T10:00:00.000Z'),
    appliedAt: null,
    ...overrides,
  };
}

function createImportedAccount(
  overrides: Partial<Record<string, unknown>> = {},
): Record<string, unknown> {
  const now = new Date('2026-04-19T10:00:00.000Z');

  return {
    id: 'account-1',
    userId: OWNER_ID,
    importSource: ImportSource.CSV_TEMPLATE,
    importKey: 'checking',
    name: 'Checking',
    type: AccountType.BANK,
    currency: 'EUR',
    institution: null,
    notes: null,
    order: 0,
    archivedAt: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function parseZipEntries(buffer: Buffer): Map<string, string> {
  const entries = new Map<string, string>();
  let offset = 0;

  while (offset + 4 <= buffer.length) {
    const signature = buffer.readUInt32LE(offset);
    if (signature !== 0x04034b50) {
      break;
    }

    const fileNameLength = buffer.readUInt16LE(offset + 26);
    const extraLength = buffer.readUInt16LE(offset + 28);
    const compressedSize = buffer.readUInt32LE(offset + 18);
    const fileNameStart = offset + 30;
    const fileNameEnd = fileNameStart + fileNameLength;
    const dataStart = fileNameEnd + extraLength;
    const dataEnd = dataStart + compressedSize;

    entries.set(
      buffer.toString('utf8', fileNameStart, fileNameEnd),
      buffer.toString('utf8', dataStart, dataEnd),
    );

    offset = dataEnd;
  }

  return entries;
}

function binaryParser(
  response: {
    on(event: 'data', callback: (chunk: Buffer | string) => void): void;
    on(event: 'end', callback: () => void): void;
    on(event: 'error', callback: (error: Error) => void): void;
  },
  callback: (error: Error | null, body: Buffer) => void,
): void {
  const chunks: Uint8Array[] = [];
  response.on('data', (chunk: Buffer | string) => {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  });
  response.on('end', () => callback(null, Buffer.concat(chunks)));
  response.on('error', (error: Error) => callback(error, Buffer.alloc(0)));
}

describe('Import routes (e2e)', () => {
  let app: INestApplication;
  let prisma: {
    account: {
      findMany: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
    asset: {
      findMany: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
    category: {
      findMany: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
    transaction: {
      findMany: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
    importBatch: {
      findMany: jest.Mock;
      findFirst: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
    $transaction: jest.Mock;
  };
  let prices: {
    normalizeCurrency: jest.Mock;
    normalizeTicker: jest.Mock;
  };

  function httpServer(): HttpServer {
    return app.getHttpServer() as HttpServer;
  }

  beforeEach(async () => {
    prisma = {
      account: {
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn(),
        update: jest.fn(),
      },
      asset: {
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn(),
        update: jest.fn(),
      },
      category: {
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn(),
        update: jest.fn(),
      },
      transaction: {
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn(),
        update: jest.fn(),
      },
      importBatch: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      $transaction: jest.fn(),
    };

    prisma.$transaction.mockImplementation(
      async (
        callback: (tx: {
          account: typeof prisma.account;
          asset: typeof prisma.asset;
          category: typeof prisma.category;
          transaction: typeof prisma.transaction;
          importBatch: typeof prisma.importBatch;
        }) => Promise<unknown>,
      ) =>
        callback({
          account: prisma.account,
          asset: prisma.asset,
          category: prisma.category,
          transaction: prisma.transaction,
          importBatch: prisma.importBatch,
        }),
    );

    prisma.importBatch.create.mockImplementation(
      ({ data }: { data: Record<string, unknown> }) =>
        createImportBatch({ ...data, id: 'batch-1' }),
    );
    prisma.importBatch.update.mockImplementation(
      ({ data }: { data: Record<string, unknown> }) =>
        createImportBatch({ ...data, id: 'batch-1' }),
    );

    prices = {
      normalizeCurrency: jest.fn((currency: string) =>
        currency.trim().toUpperCase(),
      ),
      normalizeTicker: jest.fn((ticker: string) => ticker.trim().toUpperCase()),
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [ImportsController],
      providers: [
        ImportsService,
        { provide: PrismaService, useValue: prisma },
        { provide: PricesService, useValue: prices },
        LocalOnlyImportsGuard,
        {
          provide: RequestOwnerResolver,
          useValue: {
            resolveOwnerId: () => OWNER_ID,
          },
        },
        {
          provide: IdempotencyService,
          useValue: {
            executeJson: jest.fn(
              async (options: {
                handler: () => Promise<{
                  statusCode: number;
                  body: unknown;
                }>;
              }) => ({
                ...(await options.handler()),
                replayed: false,
              }),
            ),
          },
        },
      ],
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
  });

  afterEach(async () => {
    if (app) {
      await app.close();
    }
  });

  it('accepts multipart preview uploads on POST /imports/csv/preview', async () => {
    await request(httpServer())
      .post('/imports/csv/preview')
      .attach(
        'accounts',
        Buffer.from(
          'importKey,name,type,currency,institution,notes,order,archived\nchecking,Checking,BANK,EUR,,,0,false\n',
        ),
        'accounts.csv',
      )
      .expect(201)
      .expect((response: ResponseWithBody) => {
        const body = bodyAs<Record<string, unknown>>(response);
        expect(body.canApply).toBe(true);
        expect(body.status).toBe('PREVIEW');
      });
  });

  it('rejects oversized multipart preview uploads before parsing', async () => {
    await request(httpServer())
      .post('/imports/csv/preview')
      .attach('accounts', Buffer.alloc(1024 * 1024 + 1, 'a'), 'accounts.csv')
      .expect(413);
  });

  it('applies a preview batch through POST /imports/:batchId/apply', async () => {
    await request(httpServer())
      .post('/imports/csv/preview')
      .attach(
        'accounts',
        Buffer.from(
          'importKey,name,type,currency,institution,notes,order,archived\nchecking,Checking,BANK,EUR,,,0,false\n',
        ),
        'accounts.csv',
      )
      .expect(201);

    prisma.importBatch.findFirst.mockResolvedValue(createImportBatch());
    prisma.account.create.mockResolvedValue({
      id: 'account-1',
      userId: OWNER_ID,
      importSource: ImportSource.CSV_TEMPLATE,
      importKey: 'checking',
      name: 'Checking',
      type: AccountType.BANK,
      currency: 'EUR',
      institution: null,
      notes: null,
      order: 0,
      archivedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await request(httpServer())
      .post('/imports/batch-1/apply')
      .expect(201)
      .expect((response: ResponseWithBody) => {
        const body = bodyAs<Record<string, unknown>>(response);
        expect(body.status).toBe('APPLIED');
      });
  });

  it('returns a zip export from POST /imports/csv/export', async () => {
    const account = createImportedAccount();

    prisma.account.findMany
      .mockResolvedValueOnce([account])
      .mockResolvedValueOnce([account]);
    prisma.category.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    prisma.asset.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    prisma.transaction.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    await request(httpServer())
      .post('/imports/csv/export')
      .buffer(true)
      .parse(binaryParser)
      .expect(200)
      .expect('content-type', /application\/zip/)
      .expect('content-disposition', /attachment; filename="finhance-export-/)
      .expect((response: { body: Buffer }) => {
        const entries = parseZipEntries(response.body);
        expect(entries.get('accounts.csv')).toContain(
          'importKey,name,type,currency,institution,notes,order,archived',
        );
        expect(entries.get('categories.csv')).toBe(
          'importKey,name,type,order,archived\n',
        );
      });
  });

  it('rejects applying failed preview batches', async () => {
    prisma.importBatch.findFirst.mockResolvedValue(
      createImportBatch({
        status: ImportBatchStatus.FAILED,
      }),
    );

    await request(httpServer()).post('/imports/batch-1/apply').expect(409);
  });

  it('rejects import requests from non-local browser origins', async () => {
    await request(httpServer())
      .post('/imports/csv/export')
      .set('Origin', 'https://evil.example')
      .expect(403);
  });
});
