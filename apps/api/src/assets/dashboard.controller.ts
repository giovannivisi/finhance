import { Controller, Get } from '@nestjs/common';
import { AssetsService } from '@assets/assets.service';
import { DashboardResponse } from '@assets/assets.types';
import { RequestOwnerResolver } from '@/security/request-owner.resolver';

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
