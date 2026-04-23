import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { createNamedThrottleOverride } from '@/config/throttle.config';
import { RequestOwnerResolver } from '@/security/request-owner.resolver';
import {
  MaterializeRecurringRulesResponse,
  RecurringOccurrenceResponse,
  RecurringTransactionRuleResponse,
} from '@finhance/shared';
import {
  toRecurringOccurrenceResponse,
  toRecurringTransactionRuleResponse,
} from '@recurring/recurring.mapper';
import { CreateRecurringTransactionRuleDto } from '@recurring/dto/create-recurring-transaction-rule.dto';
import { FindRecurringOccurrencesQueryDto } from '@recurring/dto/find-recurring-occurrences-query.dto';
import { UpsertRecurringOccurrenceDto } from '@recurring/dto/upsert-recurring-occurrence.dto';
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

  @Get(':id/occurrences')
  async findOccurrences(
    @Param('id') id: string,
    @Query() query: FindRecurringOccurrencesQueryDto,
  ): Promise<RecurringOccurrenceResponse[]> {
    const occurrences = await this.recurringService.findOccurrences(
      this.resolveOwnerId(),
      id,
      query,
    );
    return occurrences.map(toRecurringOccurrenceResponse);
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

  @Put(':id/occurrences/:month')
  async upsertOccurrence(
    @Param('id') id: string,
    @Param('month') month: string,
    @Body() dto: UpsertRecurringOccurrenceDto,
  ): Promise<RecurringOccurrenceResponse> {
    const occurrence = await this.recurringService.upsertOccurrence(
      this.resolveOwnerId(),
      id,
      month,
      dto,
    );
    return toRecurringOccurrenceResponse(occurrence);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@Param('id') id: string): Promise<void> {
    return this.recurringService.remove(this.resolveOwnerId(), id);
  }

  @Delete(':id/occurrences/:month')
  @HttpCode(204)
  async clearOccurrence(
    @Param('id') id: string,
    @Param('month') month: string,
  ): Promise<void> {
    return this.recurringService.clearOccurrence(
      this.resolveOwnerId(),
      id,
      month,
    );
  }

  @Post('materialize')
  @Throttle(createNamedThrottleOverride('operations'))
  async materialize(): Promise<MaterializeRecurringRulesResponse> {
    return this.recurringService.materialize(this.resolveOwnerId());
  }
}
