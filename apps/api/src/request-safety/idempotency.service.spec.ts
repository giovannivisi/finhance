import { IdempotencyRequestStatus, Prisma } from '@prisma/client';
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
    };

    prisma.$transaction.mockImplementation(
      async (callback: (tx: typeof prisma) => Promise<unknown>) =>
        callback(prisma),
    );

    service = new IdempotencyService(prisma as never);
  });

  function nthCallArg<T>(mockFn: jest.Mock, index: number): T {
    const calls = mockFn.mock.calls as unknown[][];
    return calls[index]?.[0] as T;
  }

  it('replays completed responses even when the body exceeds the former cache cap', async () => {
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
        responseJson: body as Prisma.JsonObject,
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
      handler: () => ({
        statusCode: 201,
        body,
      }),
    });

    const secondResult = await service.executeJson({
      ...requestKey,
      fingerprint: { files: ['accounts.csv'] },
      handler: () => ({
        statusCode: 201,
        body: { payload: 'should not run' },
      }),
    });

    expect(firstResult).toEqual({
      statusCode: 201,
      body,
      replayed: false,
    });
    expect(secondResult).toEqual({
      statusCode: 201,
      body,
      replayed: true,
    });
    const updateCall = nthCallArg<{
      data: {
        responseJson: unknown;
      };
    }>(prisma.idempotencyRequest.update, 0);
    expect(updateCall.data.responseJson).toEqual(body);
  });
});
