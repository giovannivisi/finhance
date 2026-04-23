import { Controller, Get, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { createNamedThrottleOverride } from '@/config/throttle.config';
import { RequestOwnerResolver } from '@/security/request-owner.resolver';
import { CashflowAnalyticsQueryDto } from '@transactions/dto/cashflow-analytics-query.dto';
import { CashflowMonthlyQueryDto } from '@transactions/dto/cashflow-monthly-query.dto';
import { CashflowSummaryQueryDto } from '@transactions/dto/cashflow-summary-query.dto';
import { TransactionsService } from '@transactions/transactions.service';
import type {
  CashflowAnalyticsResponse,
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
  @Throttle(createNamedThrottleOverride('analytics'))
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

  @Get('analytics')
  @Throttle(createNamedThrottleOverride('analytics'))
  async getAnalytics(
    @Query() query: CashflowAnalyticsQueryDto,
  ): Promise<CashflowAnalyticsResponse> {
    return this.transactionsService.getCashflowAnalytics(
      this.resolveOwnerId(),
      {
        from: query.from,
        to: query.to,
        accountId: query.accountId,
        categoryId: query.categoryId,
        includeArchivedAccounts: query.includeArchivedAccounts,
      },
    );
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
