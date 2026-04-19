import { Controller, Get, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { RequestOwnerResolver } from '@/security/request-owner.resolver';
import { CashflowMonthlyQueryDto } from '@transactions/dto/cashflow-monthly-query.dto';
import { CashflowSummaryQueryDto } from '@transactions/dto/cashflow-summary-query.dto';
import { TransactionsService } from '@transactions/transactions.service';
import type {
  CashflowSummaryResponse,
  MonthlyCashflowResponse,
} from '@finhance/shared';

@Controller('cashflow')
export class CashflowController {
  constructor(
    private readonly transactionsService: TransactionsService,
    private readonly requestOwnerResolver: RequestOwnerResolver,
  ) {}

  private resolveOwnerId(): string {
    return this.requestOwnerResolver.resolveOwnerId();
  }

  @Get('monthly')
  @Throttle({
    monthlyCashflow: {
      limit: 5,
      ttl: 60_000,
    },
  })
  async getMonthly(
    @Query() query: CashflowMonthlyQueryDto,
  ): Promise<MonthlyCashflowResponse> {
    return this.transactionsService.getMonthlyCashflow(this.resolveOwnerId(), {
      from: query.from,
      to: query.to,
      accountIds: query.accountId,
      includeArchivedAccounts: query.includeArchivedAccounts,
    });
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
