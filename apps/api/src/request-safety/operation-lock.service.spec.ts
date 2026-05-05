import { ConflictException, HttpStatus } from '@nestjs/common';
import { OperationType, Prisma } from '@finhance/db';
import { OperationLockService } from '@/request-safety/operation-lock.service';

type OperationStateRecord = {
  userId: string;
  type: OperationType;
  startedAt: Date | null;
  lastSucceededAt: Date | null;
};

type UpdateArgs = {
  where: {
    userId_type: {
      userId: string;
      type: OperationType;
    };
  };
  data: {
    startedAt: Date | null;
    lastSucceededAt: Date | null;
  };
};

type UpdateManyArgs = {
  where: {
    userId: string;
    type: OperationType;
  };
  data: {
    startedAt: null;
  };
};

type RunExclusiveOptions = {
  userId: string;
  type: OperationType;
  startedAt?: Date;
  inProgressMessage: string;
  cooldownMs?: number;
  cooldownMessage?: (remainingSeconds: number) => string;
};

const RECURRING_MATERIALIZATION = 'RECURRING_MATERIALIZATION' as OperationType;
const PORTFOLIO_REFRESH = 'PORTFOLIO_REFRESH' as OperationType;

function createMock<Args extends unknown[], Result>(): jest.Mock<Result, Args> {
  return jest.fn<Result, Args>();
}

describe('OperationLockService', () => {
  let service: OperationLockService;
  let tx: {
    operationState: {
      findUnique: jest.Mock<Promise<OperationStateRecord | null>, [unknown]>;
      upsert: jest.Mock<Promise<void>, [unknown]>;
    };
  };
  let prisma: {
    operationState: {
      update: jest.Mock<Promise<void>, [UpdateArgs]>;
      updateMany: jest.Mock<Promise<{ count: number }>, [UpdateManyArgs]>;
    };
    $transaction: jest.Mock<
      Promise<unknown>,
      [
        callback: (client: typeof tx) => Promise<unknown>,
        options?: { isolationLevel?: Prisma.TransactionIsolationLevel },
      ]
    >;
  };

  beforeEach(() => {
    tx = {
      operationState: {
        findUnique: createMock<
          [unknown],
          Promise<OperationStateRecord | null>
        >(),
        upsert: createMock<[unknown], Promise<void>>(),
      },
    };

    prisma = {
      operationState: {
        update: createMock<[UpdateArgs], Promise<void>>(),
        updateMany: createMock<[UpdateManyArgs], Promise<{ count: number }>>(),
      },
      $transaction: createMock<
        [
          callback: (client: typeof tx) => Promise<unknown>,
          options?: { isolationLevel?: Prisma.TransactionIsolationLevel },
        ],
        Promise<unknown>
      >(),
    };

    prisma.$transaction.mockImplementation(
      async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
    );

    service = new OperationLockService(prisma as never);
  });

  function updateCallArg(callIndex = 0): UpdateArgs {
    const call = prisma.operationState.update.mock.calls.at(callIndex);
    expect(call).toBeDefined();
    return call![0];
  }

  function updateManyCallArg(callIndex = 0): UpdateManyArgs {
    const call = prisma.operationState.updateMany.mock.calls.at(callIndex);
    expect(call).toBeDefined();
    return call![0];
  }

  function retryableError(code: 'P2002' | 'P2034') {
    return new Prisma.PrismaClientKnownRequestError('retryable', {
      code,
      clientVersion: '6.19.0',
    });
  }

  it('blocks overlapping work when a fresh lock already exists', async () => {
    const existingState: OperationStateRecord = {
      userId: 'local-dev',
      type: RECURRING_MATERIALIZATION,
      startedAt: new Date('2026-04-29T10:00:00.000Z'),
      lastSucceededAt: null,
    };
    const options: RunExclusiveOptions = {
      userId: 'local-dev',
      type: RECURRING_MATERIALIZATION,
      startedAt: new Date('2026-04-29T10:05:00.000Z'),
      inProgressMessage: 'Recurring sync is already running.',
    };
    tx.operationState.findUnique.mockResolvedValue(existingState);

    await expect(
      service.runExclusive(options, () => Promise.resolve('unreachable')),
    ).rejects.toThrow(ConflictException);

    expect(tx.operationState.upsert).not.toHaveBeenCalled();
  });

  it('surfaces cooldown countdowns before claiming a new lock', async () => {
    const existingState: OperationStateRecord = {
      userId: 'local-dev',
      type: PORTFOLIO_REFRESH,
      startedAt: null,
      lastSucceededAt: new Date('2026-04-29T10:00:45.000Z'),
    };
    const options: RunExclusiveOptions = {
      userId: 'local-dev',
      type: PORTFOLIO_REFRESH,
      startedAt: new Date('2026-04-29T10:01:00.000Z'),
      inProgressMessage: 'Refresh already running.',
      cooldownMs: 60_000,
      cooldownMessage: (remainingSeconds) =>
        `Refresh is cooling down. Try again in ${remainingSeconds}s.`,
    };
    tx.operationState.findUnique.mockResolvedValue(existingState);

    try {
      await service.runExclusive(options, () => Promise.resolve('unreachable'));
      throw new Error('Expected cooldown failure');
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect(error).toMatchObject({
        message: 'Refresh is cooling down. Try again in 45s.',
      });

      if (error && typeof error === 'object' && 'getStatus' in error) {
        expect((error as { getStatus: () => number }).getStatus()).toBe(
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
    }
  });

  it('marks successful work as completed using the operation start time', async () => {
    const startedAt = new Date('2026-04-29T10:00:00.000Z');
    const options: RunExclusiveOptions = {
      userId: 'local-dev',
      type: PORTFOLIO_REFRESH,
      startedAt,
      inProgressMessage: 'Refresh already running.',
    };
    tx.operationState.findUnique.mockResolvedValue(null);
    tx.operationState.upsert.mockResolvedValue(undefined);
    prisma.operationState.update.mockResolvedValue(undefined);

    const result = await service.runExclusive(options, () =>
      Promise.resolve('ok'),
    );

    expect(result).toBe('ok');
    expect(updateCallArg()).toEqual({
      where: {
        userId_type: {
          userId: 'local-dev',
          type: PORTFOLIO_REFRESH,
        },
      },
      data: {
        startedAt: null,
        lastSucceededAt: startedAt,
      },
    });
  });

  it('releases the claimed lock when work fails', async () => {
    const options: RunExclusiveOptions = {
      userId: 'local-dev',
      type: RECURRING_MATERIALIZATION,
      startedAt: new Date('2026-04-29T10:00:00.000Z'),
      inProgressMessage: 'Recurring sync is already running.',
    };
    tx.operationState.findUnique.mockResolvedValue(null);
    tx.operationState.upsert.mockResolvedValue(undefined);
    prisma.operationState.updateMany.mockResolvedValue({ count: 1 });

    await expect(
      service.runExclusive(options, () => Promise.reject(new Error('boom'))),
    ).rejects.toThrow('boom');

    expect(updateManyCallArg()).toEqual({
      where: {
        userId: 'local-dev',
        type: RECURRING_MATERIALIZATION,
      },
      data: {
        startedAt: null,
      },
    });
  });

  it('retries retryable Prisma conflicts during completion', async () => {
    const options: RunExclusiveOptions = {
      userId: 'local-dev',
      type: PORTFOLIO_REFRESH,
      startedAt: new Date('2026-04-29T10:00:00.000Z'),
      inProgressMessage: 'Refresh already running.',
    };
    tx.operationState.findUnique.mockResolvedValue(null);
    tx.operationState.upsert.mockResolvedValue(undefined);
    prisma.operationState.update
      .mockRejectedValueOnce(retryableError('P2034'))
      .mockResolvedValueOnce(undefined);

    await expect(
      service.runExclusive(options, () => Promise.resolve('ok')),
    ).resolves.toBe('ok');

    expect(prisma.operationState.update).toHaveBeenCalledTimes(2);
  });
});
