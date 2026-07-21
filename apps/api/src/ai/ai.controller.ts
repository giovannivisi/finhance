import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { AiTransactionDraft } from '@finhance/shared';
import { createNamedThrottleOverride } from '@/config/throttle.config';
import { CreateTransactionDraftDto } from '@/ai/dto/create-transaction-draft.dto';
import { RequestOwnerResolver } from '@/security/request-owner.resolver';
import { TransactionDraftService } from '@/ai/transaction-draft.service';

@Controller('ai')
export class AiController {
  constructor(
    private readonly transactionDraftService: TransactionDraftService,
    private readonly requestOwnerResolver: RequestOwnerResolver,
  ) {}

  @Post('transaction-draft')
  @HttpCode(200)
  @Throttle(createNamedThrottleOverride('ai'))
  async createTransactionDraft(
    @Body() dto: CreateTransactionDraftDto,
  ): Promise<AiTransactionDraft> {
    return this.transactionDraftService.create(
      this.requestOwnerResolver.resolveOwnerId(),
      dto,
    );
  }
}
