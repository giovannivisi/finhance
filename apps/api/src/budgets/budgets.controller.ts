import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import type {
  CategoryBudgetOverrideResponse,
  CategoryBudgetResponse,
  MonthlyBudgetResponse,
} from '@finhance/shared';
import { RequestOwnerResolver } from '@/security/request-owner.resolver';
import { BudgetsService } from '@budgets/budgets.service';
import { CreateCategoryBudgetDto } from '@budgets/dto/create-category-budget.dto';
import { DeleteCategoryBudgetQueryDto } from '@budgets/dto/delete-category-budget-query.dto';
import { FindCategoryBudgetOverridesQueryDto } from '@budgets/dto/find-category-budget-overrides-query.dto';
import { FindMonthlyBudgetQueryDto } from '@budgets/dto/find-monthly-budget-query.dto';
import { UpdateCategoryBudgetDto } from '@budgets/dto/update-category-budget.dto';
import { UpsertCategoryBudgetOverrideDto } from '@budgets/dto/upsert-category-budget-override.dto';

@Controller('budgets')
export class BudgetsController {
  constructor(
    private readonly budgetsService: BudgetsService,
    private readonly requestOwnerResolver: RequestOwnerResolver,
  ) {}

  private resolveOwnerId(): string {
    return this.requestOwnerResolver.resolveOwnerId();
  }

  @Get()
  async findMonthly(
    @Query() query: FindMonthlyBudgetQueryDto,
  ): Promise<MonthlyBudgetResponse> {
    return this.budgetsService.findMonthly(this.resolveOwnerId(), query.month, {
      includeArchivedCategories: query.includeArchivedCategories,
    });
  }

  @Post()
  async create(
    @Body() dto: CreateCategoryBudgetDto,
  ): Promise<CategoryBudgetResponse> {
    return this.budgetsService.create(this.resolveOwnerId(), dto);
  }

  @Put(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateCategoryBudgetDto,
  ): Promise<CategoryBudgetResponse> {
    return this.budgetsService.update(this.resolveOwnerId(), id, dto);
  }

  @Delete(':id')
  async remove(
    @Param('id') id: string,
    @Query() query: DeleteCategoryBudgetQueryDto,
  ): Promise<void> {
    return this.budgetsService.remove(
      this.resolveOwnerId(),
      id,
      query.effectiveMonth,
    );
  }

  @Get(':id/overrides')
  async findOverrides(
    @Param('id') id: string,
    @Query() query: FindCategoryBudgetOverridesQueryDto,
  ): Promise<CategoryBudgetOverrideResponse[]> {
    return this.budgetsService.findOverrides(this.resolveOwnerId(), id, {
      from: query.from,
      to: query.to,
    });
  }

  @Put(':id/overrides/:month')
  async upsertOverride(
    @Param('id') id: string,
    @Param('month') month: string,
    @Body() dto: UpsertCategoryBudgetOverrideDto,
  ): Promise<CategoryBudgetOverrideResponse> {
    return this.budgetsService.upsertOverride(
      this.resolveOwnerId(),
      id,
      month,
      dto,
    );
  }

  @Delete(':id/overrides/:month')
  async clearOverride(
    @Param('id') id: string,
    @Param('month') month: string,
  ): Promise<void> {
    return this.budgetsService.clearOverride(this.resolveOwnerId(), id, month);
  }
}
