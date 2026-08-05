import { Body, Controller, Get, Param, Post, Put } from '@nestjs/common';
import { RequestOwnerResolver } from '@/security/request-owner.resolver';
import { CreateInvestmentPlanDto } from '@investment-plans/dto/create-investment-plan.dto';
import { RecordInvestmentPlanBuyDto } from '@investment-plans/dto/record-investment-plan-buy.dto';
import { UpdateInvestmentPlanDto } from '@investment-plans/dto/update-investment-plan.dto';
import { toInvestmentPlanResponse } from '@investment-plans/investment-plans.mapper';
import { InvestmentPlansService } from '@investment-plans/investment-plans.service';
import type {
  InvestmentPlanResponse,
  RecordInvestmentPlanBuyResponse,
} from '@finhance/shared';

@Controller('investment-plans')
export class InvestmentPlansController {
  constructor(
    private readonly investmentPlansService: InvestmentPlansService,
    private readonly requestOwnerResolver: RequestOwnerResolver,
  ) {}

  private resolveOwnerId(): string {
    return this.requestOwnerResolver.resolveOwnerId();
  }

  @Get()
  async findAll(): Promise<InvestmentPlanResponse[]> {
    const plans = await this.investmentPlansService.findAll(
      this.resolveOwnerId(),
    );
    return plans.map((plan) => toInvestmentPlanResponse(plan));
  }

  @Get(':id')
  async findOne(@Param('id') id: string): Promise<InvestmentPlanResponse> {
    const plan = await this.investmentPlansService.findOne(
      this.resolveOwnerId(),
      id,
    );
    return toInvestmentPlanResponse(plan);
  }

  @Post()
  async create(
    @Body() dto: CreateInvestmentPlanDto,
  ): Promise<InvestmentPlanResponse> {
    const plan = await this.investmentPlansService.create(
      this.resolveOwnerId(),
      dto,
    );
    return toInvestmentPlanResponse(plan);
  }

  @Put(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateInvestmentPlanDto,
  ): Promise<InvestmentPlanResponse> {
    const plan = await this.investmentPlansService.update(
      this.resolveOwnerId(),
      id,
      dto,
    );
    return toInvestmentPlanResponse(plan);
  }

  @Post(':id/pause')
  async pause(@Param('id') id: string): Promise<InvestmentPlanResponse> {
    const plan = await this.investmentPlansService.pause(
      this.resolveOwnerId(),
      id,
    );
    return toInvestmentPlanResponse(plan);
  }

  @Post(':id/resume')
  async resume(@Param('id') id: string): Promise<InvestmentPlanResponse> {
    const plan = await this.investmentPlansService.resume(
      this.resolveOwnerId(),
      id,
    );
    return toInvestmentPlanResponse(plan);
  }

  @Post(':id/skip')
  async skip(@Param('id') id: string): Promise<InvestmentPlanResponse> {
    const plan = await this.investmentPlansService.skip(
      this.resolveOwnerId(),
      id,
    );
    return toInvestmentPlanResponse(plan);
  }

  @Post(':id/record-buy')
  async recordBuy(
    @Param('id') id: string,
    @Body() dto: RecordInvestmentPlanBuyDto,
  ): Promise<RecordInvestmentPlanBuyResponse> {
    const result = await this.investmentPlansService.recordBuy(
      this.resolveOwnerId(),
      id,
      dto,
    );
    return {
      plan: toInvestmentPlanResponse(result.plan),
      operation: result.operation,
    };
  }
}
