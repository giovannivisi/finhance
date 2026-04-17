import { Controller, Get } from '@nestjs/common';
import { AssetsService } from '@assets/assets.service';
import { RequestOwnerResolver } from '@/security/request-owner.resolver';
import type { DashboardResponse } from '@finhance/shared';

@Controller('dashboard')
export class DashboardController {
  constructor(
    private readonly assetsService: AssetsService,
    private readonly requestOwnerResolver: RequestOwnerResolver,
  ) {}

  @Get()
  async getDashboard(): Promise<DashboardResponse> {
    return this.assetsService.getDashboard(
      this.requestOwnerResolver.resolveOwnerId(),
    );
  }
}
