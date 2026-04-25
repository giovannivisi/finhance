import { Controller, Get, Query } from '@nestjs/common';
import { RequestOwnerResolver } from '@/security/request-owner.resolver';
import { SetupService } from '@/setup/setup.service';
import type { SetupStatusResponse } from '@finhance/shared';

@Controller('setup')
export class SetupController {
  constructor(
    private readonly setupService: SetupService,
    private readonly requestOwnerResolver: RequestOwnerResolver,
  ) {}

  @Get('status')
  async getStatus(
    @Query('includeWarnings') includeWarnings?: string,
  ): Promise<SetupStatusResponse> {
    return this.setupService.getStatus(
      this.requestOwnerResolver.resolveOwnerId(),
      {
        includeWarnings: includeWarnings !== 'false',
      },
    );
  }
}
