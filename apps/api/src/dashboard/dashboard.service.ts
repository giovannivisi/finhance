import { Injectable, Logger } from '@nestjs/common';
import { AssetsService } from '@assets/assets.service';
import { SnapshotsService } from '@snapshots/snapshots.service';
import type { DashboardResponse } from '@finhance/shared';
import type { NetWorthSnapshot } from '@prisma/client';

@Injectable()
export class DashboardService {
  private readonly logger = new Logger(DashboardService.name);

  constructor(
    private readonly assetsService: AssetsService,
    private readonly snapshotsService: SnapshotsService,
  ) {}

  async getDashboard(ownerId: string): Promise<DashboardResponse> {
    const dashboard = await this.assetsService.getDashboard(ownerId);
    const [latestSnapshot, hasTodaySnapshot] = await Promise.all([
      this.snapshotsService.findLatest(ownerId, dashboard.baseCurrency),
      this.snapshotsService.hasSnapshotForDate(ownerId, dashboard.baseCurrency),
    ]);

    if (!hasTodaySnapshot) {
      void this.snapshotsService
        .captureFromDashboard(ownerId, dashboard)
        .catch((error: unknown) => {
          const message =
            error instanceof Error ? error.message : 'Unknown error';
          const stack = error instanceof Error ? error.stack : undefined;

          this.logger.error(
            `Failed opportunistic snapshot capture for owner=${ownerId} baseCurrency=${dashboard.baseCurrency}: ${message}`,
            stack,
          );
        });
    }

    return {
      ...dashboard,
      latestSnapshotDate: this.serializeSnapshotDate(latestSnapshot),
      latestSnapshotCapturedAt:
        latestSnapshot?.capturedAt.toISOString() ?? null,
      latestSnapshotIsPartial: latestSnapshot?.isPartial ?? null,
    };
  }

  private serializeSnapshotDate(
    snapshot: NetWorthSnapshot | null,
  ): string | null {
    return snapshot?.snapshotDate.toISOString().slice(0, 10) ?? null;
  }
}
