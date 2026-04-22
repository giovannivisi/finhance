import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { IdempotencyRequestStatus, Prisma } from '@prisma/client';
import { PrismaService } from '@prisma/prisma.service';

const IDEMPOTENCY_KEY_REQUIRED_MESSAGE = 'Idempotency-Key header is required.';
const IDEMPOTENCY_KEY_IN_PROGRESS_MESSAGE =
  'A request with this Idempotency-Key is already in progress.';
const IDEMPOTENCY_KEY_CONFLICT_MESSAGE =
  'This Idempotency-Key was already used for a different request.';

interface ExecuteJsonOptions<T> {
  userId: string;
  method: string;
  routePath: string;
  idempotencyKey: string | string[] | undefined;
  fingerprint: unknown;
  handler: () => Promise<{
    statusCode: number;
    body: T | undefined;
  }>;
}

interface IdempotencyReservation<T> {
  statusCode: number;
  body: T | undefined;
  replayed: boolean;
}

type IdempotencyClient = PrismaService | Prisma.TransactionClient;

@Injectable()
export class IdempotencyService {
  constructor(private readonly prisma: PrismaService) {}

  async executeJson<T>(
    options: ExecuteJsonOptions<T>,
  ): Promise<IdempotencyReservation<T>> {
    const key = this.requireIdempotencyKey(options.idempotencyKey);
    const fingerprint = this.hashFingerprint(options.fingerprint);
    const requestKey = {
      userId: options.userId,
      method: options.method.toUpperCase(),
      routePath: options.routePath,
      idempotencyKey: key,
    };
    const replay = await this.reserveRequest<T>(requestKey, fingerprint);

    if (replay) {
      return replay;
    }

    try {
      const result = await options.handler();
      await this.completeRequest(requestKey, result);

      return {
        ...result,
        replayed: false,
      };
    } catch (error) {
      await this.releaseInProgressRequest(requestKey);
      throw error;
    }
  }

  private requireIdempotencyKey(value: string | string[] | undefined): string {
    const key = Array.isArray(value) ? value[0] : value;
    const normalized = key?.trim();

    if (!normalized) {
      throw new BadRequestException(IDEMPOTENCY_KEY_REQUIRED_MESSAGE);
    }

    return normalized;
  }

  private hashFingerprint(value: unknown): string {
    return createHash('sha256')
      .update(JSON.stringify(this.normalizeValue(value)))
      .digest('hex');
  }

  private normalizeValue(value: unknown): Prisma.JsonValue {
    if (value === null) {
      return null;
    }

    if (value === undefined) {
      return null;
    }

    if (typeof value === 'string' || typeof value === 'number') {
      return value;
    }

    if (typeof value === 'boolean') {
      return value;
    }

    if (value instanceof Date) {
      return value.toISOString();
    }

    if (Buffer.isBuffer(value)) {
      return createHash('sha256').update(value).digest('hex');
    }

    if (Array.isArray(value)) {
      return value.map((entry) => this.normalizeValue(entry));
    }

    if (typeof value === 'object') {
      const entries = Object.entries(value as Record<string, unknown>)
        .filter(([, entry]) => entry !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, this.normalizeValue(entry)]);

      return Object.fromEntries(entries) as Prisma.JsonObject;
    }

    if (typeof value === 'bigint' || typeof value === 'symbol') {
      return value.toString();
    }

    return null;
  }

  private async reserveRequest<T>(
    requestKey: {
      userId: string;
      method: string;
      routePath: string;
      idempotencyKey: string;
    },
    fingerprint: string,
    attempt = 0,
  ): Promise<IdempotencyReservation<T> | null> {
    try {
      return await this.prisma.$transaction(
        async (tx) =>
          this.reserveRequestTransaction<T>(tx, requestKey, fingerprint),
        {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        },
      );
    } catch (error) {
      if (attempt < 2 && this.isRetryablePrismaError(error)) {
        return this.reserveRequest(requestKey, fingerprint, attempt + 1);
      }

      throw error;
    }
  }

  private async reserveRequestTransaction<T>(
    tx: IdempotencyClient,
    requestKey: {
      userId: string;
      method: string;
      routePath: string;
      idempotencyKey: string;
    },
    fingerprint: string,
  ): Promise<IdempotencyReservation<T> | null> {
    const existing = await tx.idempotencyRequest.findUnique({
      where: {
        userId_method_routePath_idempotencyKey: requestKey,
      },
    });

    if (existing) {
      if (existing.requestFingerprint !== fingerprint) {
        throw new ConflictException(IDEMPOTENCY_KEY_CONFLICT_MESSAGE);
      }

      if (existing.status === IdempotencyRequestStatus.IN_PROGRESS) {
        throw new ConflictException(IDEMPOTENCY_KEY_IN_PROGRESS_MESSAGE);
      }

      return {
        statusCode: existing.responseStatusCode ?? 200,
        body:
          existing.responseStatusCode === 204
            ? undefined
            : ((existing.responseJson ?? undefined) as T | undefined),
        replayed: true,
      };
    }

    await tx.idempotencyRequest.create({
      data: {
        ...requestKey,
        requestFingerprint: fingerprint,
        status: IdempotencyRequestStatus.IN_PROGRESS,
      },
    });

    return null;
  }

  private async completeRequest<T>(
    requestKey: {
      userId: string;
      method: string;
      routePath: string;
      idempotencyKey: string;
    },
    result: {
      statusCode: number;
      body: T | undefined;
    },
  ): Promise<void> {
    await this.prisma.idempotencyRequest.update({
      where: {
        userId_method_routePath_idempotencyKey: requestKey,
      },
      data: {
        status: IdempotencyRequestStatus.COMPLETED,
        responseStatusCode: result.statusCode,
        responseJson:
          result.body === undefined
            ? Prisma.JsonNull
            : (result.body as Prisma.InputJsonValue),
        completedAt: new Date(),
      },
    });
  }

  private async releaseInProgressRequest(requestKey: {
    userId: string;
    method: string;
    routePath: string;
    idempotencyKey: string;
  }): Promise<void> {
    await this.prisma.idempotencyRequest.deleteMany({
      where: {
        ...requestKey,
        status: IdempotencyRequestStatus.IN_PROGRESS,
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
