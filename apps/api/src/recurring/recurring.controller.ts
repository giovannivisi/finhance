import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Put,
} from '@nestjs/common';
import { RequestOwnerResolver } from '@/security/request-owner.resolver';
import {
  MaterializeRecurringRulesResponse,
  RecurringTransactionRuleResponse,
} from '@finhance/shared';
import { toRecurringTransactionRuleResponse } from '@recurring/recurring.mapper';
import { CreateRecurringTransactionRuleDto } from '@recurring/dto/create-recurring-transaction-rule.dto';
import { UpdateRecurringTransactionRuleDto } from '@recurring/dto/update-recurring-transaction-rule.dto';
import { RecurringService } from '@recurring/recurring.service';

@Controller('recurring-rules')
export class RecurringController {
  constructor(
    private readonly recurringService: RecurringService,
    private readonly requestOwnerResolver: RequestOwnerResolver,
  ) {}

  private resolveOwnerId(): string {
    return this.requestOwnerResolver.resolveOwnerId();
  }

  @Get()
  async findAll(): Promise<RecurringTransactionRuleResponse[]> {
    const rules = await this.recurringService.findAll(this.resolveOwnerId());
    return rules.map(toRecurringTransactionRuleResponse);
  }

  @Post()
  async create(
    @Body() dto: CreateRecurringTransactionRuleDto,
  ): Promise<RecurringTransactionRuleResponse> {
    const rule = await this.recurringService.create(this.resolveOwnerId(), dto);
    return toRecurringTransactionRuleResponse(rule);
  }

  @Get(':id')
  async findOne(
    @Param('id') id: string,
  ): Promise<RecurringTransactionRuleResponse> {
    const rule = await this.recurringService.findOne(this.resolveOwnerId(), id);
    return toRecurringTransactionRuleResponse(rule);
  }

  @Put(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateRecurringTransactionRuleDto,
  ): Promise<RecurringTransactionRuleResponse> {
    const rule = await this.recurringService.update(
      this.resolveOwnerId(),
      id,
      dto,
    );
    return toRecurringTransactionRuleResponse(rule);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@Param('id') id: string): Promise<void> {
    return this.recurringService.remove(this.resolveOwnerId(), id);
  }

  @Post('materialize')
  async materialize(): Promise<MaterializeRecurringRulesResponse> {
    return this.recurringService.materialize(this.resolveOwnerId());
  }
}
