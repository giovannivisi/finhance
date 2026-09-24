import { ImportBatchStatus, Prisma } from '@finhance/db';
import type { ImportPayload } from '@imports/imports.types';
import { PrismaService } from '@prisma/prisma.service';

const IMPORT_PREVIEW_TTL_MS = 15 * 60 * 1000;

export interface StoredPreviewPayload {
  ownerId: string;
  payload: ImportPayload;
  expiresAt: number;
}

/**
 * Owns the short-lived in-memory and persisted preview lifecycle.
 * Persisted cleanup is request-driven so idle deployments can scale to zero.
 */
export class ImportPreviewStore {
  private readonly payloads = new Map<string, StoredPreviewPayload>();

  constructor(private readonly prisma: PrismaService) {}

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
}
