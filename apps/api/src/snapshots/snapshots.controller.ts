import { Body, Controller, Get, Post } from '@nestjs/common';
import { RequestOwnerResolver } from '@/security/request-owner.resolver';
import { CaptureSnapshotDto } from '@snapshots/dto/capture-snapshot.dto';
import {
  toNetWorthSnapshotResponse,
  toSnapshotCaptureResponse,
} from '@snapshots/snapshots.mapper';
import { SnapshotsService } from '@snapshots/snapshots.service';
import type {
  NetWorthSnapshotResponse,
  SnapshotCaptureResponse,
} from '@finhance/shared';

@Controller('snapshots')
export class SnapshotsController {
  constructor(
    private readonly snapshotsService: SnapshotsService,
    private readonly requestOwnerResolver: RequestOwnerResolver,
  ) {}

  private resolveOwnerId(): string {
    return this.requestOwnerResolver.resolveOwnerId();
  }

  @Post('capture')
  async capture(
    @Body() _dto: CaptureSnapshotDto,
  ): Promise<SnapshotCaptureResponse> {
    void _dto;
    const snapshot = await this.snapshotsService.capture(this.resolveOwnerId());
    return toSnapshotCaptureResponse(snapshot);
  }

  @Get()
  async findAll(): Promise<NetWorthSnapshotResponse[]> {
    const snapshots = await this.snapshotsService.findAll(
      this.resolveOwnerId(),
    );
    return snapshots.map(toNetWorthSnapshotResponse);
  }
}
