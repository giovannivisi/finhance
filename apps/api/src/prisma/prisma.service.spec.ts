import { Logger } from '@nestjs/common';
import { Prisma } from '@finhance/db';
import {
  isRetryableConnectionError,
  runWithTransientRetry,
} from '@prisma/prisma.service';

function createAsyncMock<T>(): jest.Mock<Promise<T>, []> {
  return jest.fn<Promise<T>, []>();
}

function createWarnMock(): jest.Mock<void, Parameters<Logger['warn']>> {
  return jest.fn<void, Parameters<Logger['warn']>>();
}

function retryableConnectionError() {
  return new Prisma.PrismaClientKnownRequestError('transient connection loss', {
    code: 'P1001',
    clientVersion: 'test',
  });
}

function retryablePoolTimeoutError() {
  return new Prisma.PrismaClientKnownRequestError(
    'Timed out fetching a new connection from the connection pool.',
    {
      code: 'P2024',
      clientVersion: 'test',
    },
  );
}

function retryableTransactionStartTimeoutError() {
  return new Prisma.PrismaClientKnownRequestError(
    'Transaction API error: Unable to start a transaction in the given time.',
    {
      code: 'P2028',
      clientVersion: 'test',
      meta: {
        error: 'Unable to start a transaction in the given time.',
      },
    },
  );
}

function nonRetryableTransactionApiError() {
  return new Prisma.PrismaClientKnownRequestError(
    'Transaction API error: Transaction already closed.',
    {
      code: 'P2028',
      clientVersion: 'test',
      meta: {
        error: 'Transaction already closed.',
      },
    },
  );
}

describe('PrismaService helpers', () => {
  it('recognizes retryable connection errors', () => {
    expect(isRetryableConnectionError(retryableConnectionError())).toBe(true);
    expect(isRetryableConnectionError(retryablePoolTimeoutError())).toBe(true);
    expect(
      isRetryableConnectionError(retryableTransactionStartTimeoutError()),
    ).toBe(true);
    expect(
      isRetryableConnectionError(
        new Prisma.PrismaClientKnownRequestError('conflict', {
          code: 'P2002',
          clientVersion: 'test',
        }),
      ),
    ).toBe(false);
    expect(isRetryableConnectionError(nonRetryableTransactionApiError())).toBe(
      false,
    );
  });

  it('reconnects and retries once after a transient connection error', async () => {
    const reconnect = createAsyncMock<void>().mockResolvedValue(undefined);
    const operation = createAsyncMock<string>()
      .mockRejectedValueOnce(retryableConnectionError())
      .mockResolvedValueOnce('ok');
    const logger = {
      warn: createWarnMock(),
    };

    await expect(
      runWithTransientRetry({
        logger,
        operationLabel: 'asset.findMany',
        operation,
        reconnect,
      }),
    ).resolves.toBe('ok');

    expect(reconnect).toHaveBeenCalledTimes(1);
    expect(operation).toHaveBeenCalledTimes(2);
    expect(logger.warn).toHaveBeenCalledTimes(1);
  });

  it('reconnects and retries once after a connection-pool timeout', async () => {
    const reconnect = createAsyncMock<void>().mockResolvedValue(undefined);
    const operation = createAsyncMock<string>()
      .mockRejectedValueOnce(retryablePoolTimeoutError())
      .mockResolvedValueOnce('ok');
    const logger = {
      warn: createWarnMock(),
    };

    await expect(
      runWithTransientRetry({
        logger,
        operationLabel: 'idempotencyRequest.deleteMany',
        operation,
        reconnect,
      }),
    ).resolves.toBe('ok');

    expect(reconnect).toHaveBeenCalledTimes(1);
    expect(operation).toHaveBeenCalledTimes(2);
    expect(logger.warn).toHaveBeenCalledTimes(1);
  });

  it('reconnects and retries once after a transaction start timeout', async () => {
    const reconnect = createAsyncMock<void>().mockResolvedValue(undefined);
    const operation = createAsyncMock<string>()
      .mockRejectedValueOnce(retryableTransactionStartTimeoutError())
      .mockResolvedValueOnce('ok');
    const logger = {
      warn: createWarnMock(),
    };

    await expect(
      runWithTransientRetry({
        logger,
        operationLabel: 'transaction.start',
        operation,
        reconnect,
      }),
    ).resolves.toBe('ok');

    expect(reconnect).toHaveBeenCalledTimes(1);
    expect(operation).toHaveBeenCalledTimes(2);
    expect(logger.warn).toHaveBeenCalledTimes(1);
  });

  it('does not retry non-connection Prisma errors', async () => {
    const reconnect = createAsyncMock<void>().mockResolvedValue(undefined);
    const operation = createAsyncMock<string>().mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError('conflict', {
        code: 'P2002',
        clientVersion: 'test',
      }),
    );
    const logger = {
      warn: createWarnMock(),
    };

    await expect(
      runWithTransientRetry({
        logger,
        operationLabel: 'asset.findMany',
        operation,
        reconnect,
      }),
    ).rejects.toBeInstanceOf(Prisma.PrismaClientKnownRequestError);

    expect(reconnect).not.toHaveBeenCalled();
    expect(operation).toHaveBeenCalledTimes(1);
    expect(logger.warn).not.toHaveBeenCalled();
  });
});
