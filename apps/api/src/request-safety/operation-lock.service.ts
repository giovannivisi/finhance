import {
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { OperationType, Prisma } from '@prisma/client';
import { PrismaService } from '@prisma/prisma.service';

interface RunExclusiveOptions {
  userId: string;
  type: OperationType;
  startedAt?: Date;
  inProgressMessage: string;
  cooldownMs?: number;
  cooldownMessage?: (remainingSeconds: number) => string;
}

@Injectable()
export class OperationLockService {
  constructor(private readonly prisma: PrismaService) {}

  async runExclusive<T>(
    options: RunExclusiveOptions,
    work: () => Promise<T>,
  ): Promise<T> {
    const startedAt = options.startedAt ?? new Date();
    await this.claim(options, startedAt);

    try {
      const result = await work();
      await this.complete(options.userId, options.type, startedAt);
      return result;
    } catch (error) {
      await this.release(options.userId, options.type);
      throw error;
    }
  }

  private async claim(
    options: RunExclusiveOptions,
    startedAt: Date,
    attempt = 0,
  ): Promise<void> {
    try {
      await this.prisma.$transaction(
        async (tx) => {
          const state = await tx.operationState.findUnique({
            where: {
              userId_type: {
                userId: options.userId,
                type: options.type,
              },
            },
          });

          if (state?.startedAt) {
            throw new ConflictException(options.inProgressMessage);
          }

          if (
            options.cooldownMs &&
            state?.lastSucceededAt &&
            state.lastSucceededAt.getTime() + options.cooldownMs >
              startedAt.getTime()
          ) {
            const remainingSeconds = Math.max(
              1,
              Math.ceil(
                (state.lastSucceededAt.getTime() +
                  options.cooldownMs -
                  startedAt.getTime()) /
                  1000,
              ),
            );

            throw new HttpException(
              options.cooldownMessage?.(remainingSeconds) ??
                `Operation is cooling down. Try again in ${remainingSeconds}s.`,
              HttpStatus.TOO_MANY_REQUESTS,
            );
          }

          await tx.operationState.upsert({
            where: {
              userId_type: {
                userId: options.userId,
                type: options.type,
              },
            },
            create: {
              userId: options.userId,
              type: options.type,
              startedAt,
            },
            update: {
              startedAt,
            },
          });
        },
        {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        },
      );
    } catch (error) {
      if (attempt < 2 && this.isRetryablePrismaError(error)) {
        return this.claim(options, startedAt, attempt + 1);
      }

      throw error;
    }
  }

  private async complete(
    userId: string,
    type: OperationType,
    completedAt: Date,
  ): Promise<void> {
    await this.prisma.operationState.update({
      where: {
        userId_type: {
          userId,
          type,
        },
      },
      data: {
        startedAt: null,
        lastSucceededAt: completedAt,
      },
    });
  }

  private async release(userId: string, type: OperationType): Promise<void> {
    await this.prisma.operationState.updateMany({
      where: {
        userId,
        type,
      },
      data: {
        startedAt: null,
      },
    });
  }

  private isRetryablePrismaError(error: unknown): boolean {
    return (
      this.isPrismaError(error, 'P2002') || this.isPrismaError(error, 'P2034')
    );
  }

  private isPrismaError(
    error: unknown,
    code: string,
  ): error is Prisma.PrismaClientKnownRequestError {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === code
    );
  }
}
