import { Controller, Get, Query } from '@nestjs/common';
import { RequestOwnerResolver } from '@/security/request-owner.resolver';
import { CashflowSummaryQueryDto } from '@transactions/dto/cashflow-summary-query.dto';
import { TransactionsService } from '@transactions/transactions.service';
import type { CashflowSummaryResponse } from '@finhance/shared';

@Controller('cashflow')
export class CashflowController {
  constructor(
    private readonly transactionsService: TransactionsService,
    private readonly requestOwnerResolver: RequestOwnerResolver,
  ) {}

  private resolveOwnerId(): string {
    return this.requestOwnerResolver.resolveOwnerId();
  }

  @Get('summary')
  async getSummary(
    @Query() query: CashflowSummaryQueryDto,
  ): Promise<CashflowSummaryResponse> {
    return this.transactionsService.getCashflowSummary(
      this.resolveOwnerId(),
      query,
    );
  }
}
