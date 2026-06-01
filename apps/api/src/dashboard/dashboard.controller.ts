import { Controller, Get } from '@nestjs/common';
import { RequestOwnerResolver } from '@/security/request-owner.resolver';
import { DashboardService } from '@/dashboard/dashboard.service';
import type {
  DashboardPageDataResponse,
  DashboardResponse,
  DashboardSupportDataResponse,
} from '@finhance/shared';

@Controller('dashboard')
export class DashboardController {
  constructor(
    private readonly dashboardService: DashboardService,
    private readonly requestOwnerResolver: RequestOwnerResolver,
  ) {}

  @Get()
  async getDashboard(): Promise<DashboardResponse> {
    return this.dashboardService.getDashboard(
      this.requestOwnerResolver.resolveOwnerId(),
    );
  }

  @Get('page-data')
  async getDashboardPageData(): Promise<DashboardPageDataResponse> {
    return this.dashboardService.getPageData(
      this.requestOwnerResolver.resolveOwnerId(),
    );
  }

  @Get('support-data')
  async getDashboardSupportData(): Promise<DashboardSupportDataResponse> {
    return this.dashboardService.getSupportData(
      this.requestOwnerResolver.resolveOwnerId(),
    );
  }
}
