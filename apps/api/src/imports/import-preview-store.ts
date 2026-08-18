import { Logger } from '@nestjs/common';
import { ImportBatchStatus, Prisma } from '@finhance/db';
import type { ImportPayload } from '@imports/imports.types';
import { PrismaService } from '@prisma/prisma.service';

const IMPORT_PREVIEW_TTL_MS = 15 * 60 * 1000;
const IMPORT_PREVIEW_CLEANUP_INTERVAL_MS = 5 * 60 * 1000;

export interface StoredPreviewPayload {
  ownerId: string;
  payload: ImportPayload;
  expiresAt: number;
}

/** Owns the short-lived in-memory and persisted preview lifecycle. */
export class ImportPreviewStore {
  private readonly logger = new Logger(ImportPreviewStore.name);
  private readonly payloads = new Map<string, StoredPreviewPayload>();
  private cleanupTimer: NodeJS.Timeout | null = null;

  constructor(private readonly prisma: PrismaService) {}

  start(): void {
    this.schedulePersistedCleanup();
    this.cleanupTimer = setInterval(() => {
      this.schedulePersistedCleanup();
    }, IMPORT_PREVIEW_CLEANUP_INTERVAL_MS);
    this.cleanupTimer.unref?.();
  }

  stop(): void {
    if (!this.cleanupTimer) {
      return;
    }

    clearInterval(this.cleanupTimer);
    this.cleanupTimer = null;
  }

  remember(batchId: string, ownerId: string, payload: ImportPayload): void {
    this.payloads.set(batchId, {
      ownerId,
      payload,
      expiresAt: Date.now() + IMPORT_PREVIEW_TTL_MS,
    });
  }

  get(batchId: string): StoredPreviewPayload | undefined {
    return this.payloads.get(batchId);
  }

  remove(batchId: string): void {
    this.payloads.delete(batchId);
  }

  pruneExpired(): void {
    const now = Date.now();

    for (const [batchId, preview] of this.payloads.entries()) {
      if (preview.expiresAt <= now) {
        this.payloads.delete(batchId);
      }
    }
  }

  async clearExpiredPersisted(
    ownerId?: string,
    now: Date = new Date(),
  ): Promise<void> {
    const previewCutoff = new Date(now.getTime() - IMPORT_PREVIEW_TTL_MS);

    await this.prisma.importBatch.updateMany({
      where: {
        ...(ownerId ? { userId: ownerId } : {}),
        status: ImportBatchStatus.PREVIEW,
        createdAt: { lt: previewCutoff },
        payloadJson: { not: Prisma.AnyNull },
      },
      data: {
        payloadJson: Prisma.DbNull,
      },
    });
  }

  private schedulePersistedCleanup(): void {
    void this.clearExpiredPersisted().catch((error) => {
      this.logger.warn(
        `Import preview cleanup failed: ${this.describeError(error)}`,
      );
    });
  }

  private describeError(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
