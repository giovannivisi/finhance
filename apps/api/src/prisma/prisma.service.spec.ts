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

describe('PrismaService helpers', () => {
  it('recognizes retryable connection errors', () => {
    expect(isRetryableConnectionError(retryableConnectionError())).toBe(true);
    expect(
      isRetryableConnectionError(
        new Prisma.PrismaClientKnownRequestError('conflict', {
          code: 'P2002',
          clientVersion: 'test',
        }),
      ),
    ).toBe(false);
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
