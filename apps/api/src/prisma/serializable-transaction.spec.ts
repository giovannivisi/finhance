import { Prisma } from '@finhance/db';
import { runSerializableTransaction } from '@/prisma/serializable-transaction';
import type { PrismaService } from '@/prisma/prisma.service';

describe('runSerializableTransaction', () => {
  it('retries serialization conflicts with Serializable isolation', async () => {
    const transactionMock = jest
      .fn()
      .mockRejectedValueOnce(
        new Prisma.PrismaClientKnownRequestError('write conflict', {
          code: 'P2034',
          clientVersion: 'test',
        }),
      )
      .mockResolvedValueOnce('ok');
    const prisma = {
      $transaction: transactionMock,
    } as unknown as PrismaService;
    const callback = jest.fn().mockResolvedValue('ok');

    await expect(runSerializableTransaction(prisma, callback)).resolves.toBe(
      'ok',
    );

    expect(transactionMock).toHaveBeenCalledTimes(2);
    expect(transactionMock).toHaveBeenLastCalledWith(
      callback,
      expect.objectContaining({
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      }),
    );
  });
});
