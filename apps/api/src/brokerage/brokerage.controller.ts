import { Body, Controller, Get, Param, Post, Put, Query } from '@nestjs/common';
import { RequestOwnerResolver } from '@/security/request-owner.resolver';
import { BrokerageService } from '@brokerage/brokerage.service';
import { BrokeragePerformanceQueryDto } from '@brokerage/dto/brokerage-performance-query.dto';
import { CreateBrokerageBuyDto } from '@brokerage/dto/create-brokerage-buy.dto';
import { CreateBrokerageSellDto } from '@brokerage/dto/create-brokerage-sell.dto';
import { CreateBrokerageDividendDto } from '@brokerage/dto/create-brokerage-dividend.dto';
import { CreateBrokerageFeeDto } from '@brokerage/dto/create-brokerage-fee.dto';
import { UpdatePortfolioAllocationTargetsDto } from '@brokerage/dto/update-portfolio-allocation-targets.dto';
import type {
  BrokerageAccountSummaryResponse,
  BrokerageOperationResponse,
  BrokeragePerformanceResponse,
  BrokerageWorkspaceResponse,
  PortfolioAllocationTargetsResponse,
} from '@finhance/shared';

@Controller('brokerage')
export class BrokerageController {
  constructor(
    private readonly brokerageService: BrokerageService,
    private readonly requestOwnerResolver: RequestOwnerResolver,
  ) {}

  private resolveOwnerId(): string {
    return this.requestOwnerResolver.resolveOwnerId();
  }

  @Get()
  async list(): Promise<BrokerageAccountSummaryResponse[]> {
    return this.brokerageService.listBrokerageAccounts(this.resolveOwnerId());
  }

  @Get(':accountId')
  async getWorkspace(
    @Param('accountId') accountId: string,
  ): Promise<BrokerageWorkspaceResponse> {
    return this.brokerageService.getWorkspace(this.resolveOwnerId(), accountId);
  }

  @Get(':accountId/performance')
  async getPerformance(
    @Param('accountId') accountId: string,
    @Query() query: BrokeragePerformanceQueryDto,
  ): Promise<BrokeragePerformanceResponse> {
    return this.brokerageService.getPerformance(
      this.resolveOwnerId(),
      accountId,
      query.range ?? '1D',
    );
  }

  @Post(':accountId/buy')
  async createBuy(
    @Param('accountId') accountId: string,
    @Body() body: CreateBrokerageBuyDto,
  ): Promise<BrokerageOperationResponse> {
    return this.brokerageService.createBuy(
      this.resolveOwnerId(),
      accountId,
      body,
    );
  }

  @Post(':accountId/sell')
  async createSell(
    @Param('accountId') accountId: string,
    @Body() body: CreateBrokerageSellDto,
  ): Promise<BrokerageOperationResponse> {
    return this.brokerageService.createSell(
      this.resolveOwnerId(),
      accountId,
      body,
    );
  }

  @Post(':accountId/dividend')
  async createDividend(
    @Param('accountId') accountId: string,
    @Body() body: CreateBrokerageDividendDto,
  ): Promise<BrokerageOperationResponse> {
    return this.brokerageService.createDividend(
      this.resolveOwnerId(),
      accountId,
      body,
    );
  }

  @Post(':accountId/fee')
  async createFee(
    @Param('accountId') accountId: string,
    @Body() body: CreateBrokerageFeeDto,
  ): Promise<BrokerageOperationResponse> {
    return this.brokerageService.createFee(
      this.resolveOwnerId(),
      accountId,
      body,
    );
  }

  @Put('targets')
  async updateTargets(
    @Body() body: UpdatePortfolioAllocationTargetsDto,
  ): Promise<PortfolioAllocationTargetsResponse> {
    return this.brokerageService.updateAllocationTargets(
      this.resolveOwnerId(),
      body,
    );
  }
}
