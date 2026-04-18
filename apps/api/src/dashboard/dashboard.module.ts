import { Module } from '@nestjs/common';
import { AssetsModule } from '@assets/assets.module';
import { RequestOwnerResolver } from '@/security/request-owner.resolver';
import { SnapshotsModule } from '@snapshots/snapshots.module';
import { DashboardController } from '@/dashboard/dashboard.controller';
import { DashboardService } from '@/dashboard/dashboard.service';

@Module({
  imports: [AssetsModule, SnapshotsModule],
  controllers: [DashboardController],
  providers: [DashboardService, RequestOwnerResolver],
})
export class DashboardModule {}
