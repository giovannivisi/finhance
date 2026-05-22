import { Injectable } from '@nestjs/common';
import { OperationType } from '@finhance/db';
import { AssetsService } from '@assets/assets.service';
import { PrismaService } from '@prisma/prisma.service';
import { OperationLockService } from '@/request-safety/operation-lock.service';
import type {
  DashboardAssetResponse,
  DashboardResponse,
} from '@finhance/shared';
import { NetWorthSnapshot, Prisma } from '@finhance/db';

const SNAPSHOT_TIME_ZONE = 'Europe/Rome';
const SNAPSHOT_DATE_FORMATTER = new Intl.DateTimeFormat('en-US', {
  timeZone: SNAPSHOT_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

@Injectable()
export class SnapshotsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly assetsService: AssetsService,
    private readonly operationLockService: OperationLockService,
  ) {}

  async capture(ownerId: string): Promise<NetWorthSnapshot> {
    return this.operationLockService.runExclusive(
      {
        userId: ownerId,
        type: OperationType.SNAPSHOT_CAPTURE,
        inProgressMessage: 'Snapshot capture already in progress.',
      },
      async () => {
        const dashboard = await this.assetsService.getDashboard(ownerId);
        return this.captureFromDashboard(ownerId, dashboard);
      },
    );
  }

  async captureFromDashboard(
    ownerId: string,
    dashboard: DashboardResponse,
    capturedAt = new Date(),
  ): Promise<NetWorthSnapshot> {
    const snapshotDate = this.toSnapshotDateValue(
      this.toSnapshotDateKey(capturedAt),
    );
    const unavailableCount = dashboard.assets.filter((asset) =>
      this.isUnavailableForTotals(asset),
    ).length;
    const isPartial = unavailableCount > 0;

    return this.prisma.netWorthSnapshot.upsert({
      where: {
        userId_snapshotDate_baseCurrency: {
          userId: ownerId,
          snapshotDate,
          baseCurrency: dashboard.reportingCurrency,
        },
      },
      create: {
        userId: ownerId,
        snapshotDate,
        capturedAt,
        baseCurrency: dashboard.reportingCurrency,
        assetsTotal: this.toDecimal(dashboard.summary.assets),
        liabilitiesTotal: this.toDecimal(dashboard.summary.liabilities),
        netWorthTotal: this.toDecimal(dashboard.summary.netWorth),
        nativeAssetTotals: this.buildNativeTotals(dashboard.assets, 'ASSET'),
        nativeLiabilityTotals: this.buildNativeTotals(
          dashboard.assets,
          'LIABILITY',
        ),
        unavailableCount,
        isPartial,
      },
      update: {
        capturedAt,
        assetsTotal: this.toDecimal(dashboard.summary.assets),
        liabilitiesTotal: this.toDecimal(dashboard.summary.liabilities),
        netWorthTotal: this.toDecimal(dashboard.summary.netWorth),
        nativeAssetTotals: this.buildNativeTotals(dashboard.assets, 'ASSET'),
        nativeLiabilityTotals: this.buildNativeTotals(
          dashboard.assets,
          'LIABILITY',
        ),
        unavailableCount,
        isPartial,
      },
    });
  }

  async findLatest(
    ownerId: string,
    baseCurrency: string,
  ): Promise<NetWorthSnapshot | null> {
    return this.prisma.netWorthSnapshot.findFirst({
      where: {
        userId: ownerId,
        baseCurrency,
      },
      orderBy: [{ snapshotDate: 'desc' }, { createdAt: 'desc' }],
    });
  }

  async hasSnapshotForDate(
    ownerId: string,
    baseCurrency: string,
    capturedAt = new Date(),
  ): Promise<boolean> {
    const snapshotDate = this.toSnapshotDateValue(
      this.toSnapshotDateKey(capturedAt),
    );

    const snapshot = await this.prisma.netWorthSnapshot.findUnique({
      where: {
        userId_snapshotDate_baseCurrency: {
          userId: ownerId,
          snapshotDate,
          baseCurrency,
        },
      },
    });

    return snapshot !== null;
  }

  async findAll(ownerId: string): Promise<NetWorthSnapshot[]> {
    return this.prisma.netWorthSnapshot.findMany({
      where: { userId: ownerId },
      orderBy: [{ snapshotDate: 'asc' }, { createdAt: 'asc' }],
    });
  }

  private isUnavailableForTotals(asset: DashboardAssetResponse): boolean {
    return (
      asset.valuationSource === 'UNAVAILABLE' ||
      (asset.currentValue === null && asset.referenceValue === null)
    );
  }

  private toSnapshotDateKey(date: Date): string {
    const parts = SNAPSHOT_DATE_FORMATTER.formatToParts(date);
    const year = parts.find((part) => part.type === 'year')?.value;
    const month = parts.find((part) => part.type === 'month')?.value;
    const day = parts.find((part) => part.type === 'day')?.value;

    if (!year || !month || !day) {
      throw new Error('Unable to derive Europe/Rome snapshot date.');
    }

    return `${year}-${month}-${day}`;
  }

  private toSnapshotDateValue(snapshotDateKey: string): Date {
    return new Date(`${snapshotDateKey}T00:00:00.000Z`);
  }

  private toDecimal(value: number): Prisma.Decimal {
    return new Prisma.Decimal(value.toString());
  }

  private buildNativeTotals(
    assets: DashboardResponse['assets'],
    type: 'ASSET' | 'LIABILITY',
  ): Prisma.InputJsonValue {
    const totals = new Map<string, number>();

    for (const asset of assets) {
      if (asset.type !== type) {
        continue;
      }

      const nativeValue =
        type === 'ASSET' &&
        asset.kind !== 'CASH' &&
        asset.quantity !== null &&
        asset.lastPrice !== null
          ? asset.quantity * asset.lastPrice
          : asset.balance ?? 0;
      totals.set(asset.currency, (totals.get(asset.currency) ?? 0) + nativeValue);
    }

    return Object.fromEntries(
      [...totals.entries()].map(([currency, total]) => [currency, total]),
    );
  }
}
