import { Injectable, Logger } from '@nestjs/common';
import { AssetsService } from '@assets/assets.service';
import { SnapshotsService } from '@snapshots/snapshots.service';
import type { DashboardResponse } from '@finhance/shared';
import type { NetWorthSnapshot } from '@finhance/db';

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
      this.snapshotsService.findLatest(ownerId, dashboard.reportingCurrency),
      this.snapshotsService.hasSnapshotForDate(
        ownerId,
        dashboard.reportingCurrency,
      ),
    ]);

    if (!hasTodaySnapshot) {
      // Auto-capture today's snapshot in the background so monthly reviews
      // always have data points without requiring manual action.
      this.snapshotsService
        .captureFromDashboard(ownerId, dashboard)
        .catch((error: unknown) => {
          this.logger.warn(
            `Auto-capture snapshot failed: ${error instanceof Error ? error.message : String(error)}`,
          );
        });
    }

    return {
      ...dashboard,
      latestSnapshotDate:
        hasTodaySnapshot || latestSnapshot !== null
          ? this.serializeSnapshotDate(latestSnapshot)
          : null,
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
