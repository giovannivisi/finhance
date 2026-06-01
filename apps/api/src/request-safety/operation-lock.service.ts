import {
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
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
  staleLockMs?: number;
}

export const OPERATION_LOCK_DEFAULT_STALE_MS = 1000 * 60 * 10;

@Injectable()
export class OperationLockService {
  private readonly logger = new Logger(OperationLockService.name);

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
  ): Promise<void> {
    const staleLockMs = options.staleLockMs ?? OPERATION_LOCK_DEFAULT_STALE_MS;

    await this.withRetry(() =>
      this.prisma.$transaction(
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
            const age = startedAt.getTime() - state.startedAt.getTime();
            if (age < staleLockMs) {
              throw new ConflictException(options.inProgressMessage);
            }
            this.logger.warn(
              `Reaping stale ${options.type} lock for user ${options.userId} after ${age}ms`,
            );
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
      ),
    );
  }

  private async complete(
    userId: string,
    type: OperationType,
    completedAt: Date,
  ): Promise<void> {
    await this.withRetry(() =>
      this.prisma.operationState.update({
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
      }),
    );
  }

  private async release(userId: string, type: OperationType): Promise<void> {
    try {
      await this.withRetry(() =>
        this.prisma.operationState.updateMany({
          where: {
            userId,
            type,
          },
          data: {
            startedAt: null,
          },
        }),
      );
    } catch (error) {
      this.logger.warn(
        `Failed to release operation lock ${type} for user ${userId}: ${this.describeError(error)}`,
      );
    }
  }

  private async withRetry<T>(
    operation: () => Promise<T>,
    attempt = 0,
  ): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (attempt < 2 && this.isRetryablePrismaError(error)) {
        return this.withRetry(operation, attempt + 1);
      }

      throw error;
    }
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

  private describeError(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }
    return String(error);
  }
}
