import { Module } from '@nestjs/common';
import { AssetsModule } from '@assets/assets.module';
import { RequestOwnerResolver } from '@/security/request-owner.resolver';
import { SnapshotsController } from '@snapshots/snapshots.controller';
import { SnapshotsService } from '@snapshots/snapshots.service';

@Module({
  imports: [AssetsModule],
  controllers: [SnapshotsController],
  providers: [SnapshotsService, RequestOwnerResolver],
})
export class SnapshotsModule {}
