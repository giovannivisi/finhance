import { Controller, Get } from '@nestjs/common';
import { AssetsService } from '@assets/assets.service';
import { DashboardResponse } from '@assets/assets.types';

@Controller('dashboard')
export class DashboardController {
  constructor(private readonly assetsService: AssetsService) {}

  @Get()
  async getDashboard(): Promise<DashboardResponse> {
    return this.assetsService.getDashboard();
  }
}
