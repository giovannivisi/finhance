import { IdempotencyRequestStatus, Prisma } from '@finhance/db';
import {
  IDEMPOTENCY_MAX_CACHED_BODY_BYTES,
  IdempotencyService,
} from '@/request-safety/idempotency.service';

describe('IdempotencyService', () => {
  let service: IdempotencyService;
  let prisma: {
    idempotencyRequest: {
      findUnique: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      deleteMany: jest.Mock;
    };
    $transaction: jest.Mock;
    recoverConnection: jest.Mock;
  };

  beforeEach(() => {
    prisma = {
      idempotencyRequest: {
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        deleteMany: jest.fn(),
      },
      $transaction: jest.fn(),
      recoverConnection: jest.fn().mockResolvedValue(undefined),
    };

    prisma.$transaction.mockImplementation(
      async (callback: (tx: typeof prisma) => Promise<unknown>) =>
        callback(prisma),
    );

    service = new IdempotencyService(prisma as never);
  });

  function retryableTransactionStartTimeoutError() {
    return new Prisma.PrismaClientKnownRequestError(
      'Transaction API error: Unable to start a transaction in the given time.',
      {
        code: 'P2028',
        clientVersion: '6.19.0',
        meta: {
          error: 'Unable to start a transaction in the given time.',
        },
      },
    );
  }

  function nthCallArg<T>(mockFn: jest.Mock, index: number): T {
    const calls = mockFn.mock.calls as unknown[][];
    return calls[index]?.[0] as T;
  }

  it('rejects replays whose completed response body exceeded the cache cap', async () => {
    const body = {
      payload: 'x'.repeat(IDEMPOTENCY_MAX_CACHED_BODY_BYTES + 128),
    };
    let storedFingerprint: string | null = null;
    const requestKey = {
      userId: 'local-dev',
      method: 'POST',
      routePath: '/imports/csv/preview',
      idempotencyKey: 'key-1',
    };

    prisma.idempotencyRequest.findUnique
      .mockResolvedValueOnce(null)
      .mockImplementationOnce(() => ({
        ...requestKey,
        requestFingerprint: storedFingerprint,
        status: IdempotencyRequestStatus.COMPLETED,
        responseStatusCode: 201,
        responseJson: null,
      }));

    prisma.idempotencyRequest.create.mockImplementation(
      ({ data }: { data: { requestFingerprint: string } }) => {
        storedFingerprint = data.requestFingerprint;
        return Promise.resolve({
          ...requestKey,
          requestFingerprint: data.requestFingerprint,
          status: IdempotencyRequestStatus.IN_PROGRESS,
        });
      },
    );
    prisma.idempotencyRequest.update.mockImplementation(
      ({ data }: { data: { responseJson: unknown } }) =>
        Promise.resolve({
          ...requestKey,
          status: IdempotencyRequestStatus.COMPLETED,
          responseStatusCode: 201,
          responseJson: data.responseJson,
        }),
    );

    const firstResult = await service.executeJson({
      ...requestKey,
      fingerprint: { files: ['accounts.csv'] },
      handler: () =>
        Promise.resolve({
          statusCode: 201,
          body,
        }),
    });

    expect(firstResult).toEqual({
      statusCode: 201,
      body,
      replayed: false,
    });
    await expect(
      service.executeJson({
        ...requestKey,
        fingerprint: { files: ['accounts.csv'] },
        handler: () =>
          Promise.resolve({
            statusCode: 201,
            body: { payload: 'should not run' },
          }),
      }),
    ).rejects.toThrow(
      'This Idempotency-Key completed successfully, but its response is no longer available for replay.',
    );
    const updateCall = nthCallArg<{
      data: {
        responseJson: unknown;
      };
    }>(prisma.idempotencyRequest.update, 0);
    expect(updateCall.data.responseJson).toBe(Prisma.JsonNull);
  });

  it('recovers and retries when reserving an idempotent request times out starting a transaction', async () => {
    const requestKey = {
      userId: 'local-dev',
      method: 'POST',
      routePath: '/imports/csv/preview',
      idempotencyKey: 'key-2',
    };

    prisma.$transaction
      .mockRejectedValueOnce(retryableTransactionStartTimeoutError())
      .mockImplementationOnce(
        async (callback: (tx: typeof prisma) => Promise<unknown>) =>
          callback(prisma),
      );
    prisma.idempotencyRequest.findUnique.mockResolvedValue(null);
    prisma.idempotencyRequest.create.mockResolvedValue({
      ...requestKey,
      status: IdempotencyRequestStatus.IN_PROGRESS,
    });
    prisma.idempotencyRequest.update.mockResolvedValue({
      ...requestKey,
      status: IdempotencyRequestStatus.COMPLETED,
      responseStatusCode: 201,
      responseJson: { ok: true },
    });

    const result = await service.executeJson({
      ...requestKey,
      fingerprint: { files: ['categories.csv'] },
      handler: () =>
        Promise.resolve({
          statusCode: 201,
          body: { ok: true },
        }),
    });

    expect(result).toEqual({
      statusCode: 201,
      body: { ok: true },
      replayed: false,
    });
    expect(prisma.recoverConnection).toHaveBeenCalledTimes(1);
    expect(prisma.$transaction).toHaveBeenCalledTimes(2);
  });
});
