import { Controller, Get, Query } from '@nestjs/common';
import { AccountsService } from '@accounts/accounts.service';
import { toAccountResponse } from '@accounts/accounts.mapper';
import { Throttle } from '@nestjs/throttler';
import { createNamedThrottleOverride } from '@/config/throttle.config';
import { RequestOwnerResolver } from '@/security/request-owner.resolver';
import { SetupService } from '@/setup/setup.service';
import { toCategoryResponse } from '@transactions/categories.mapper';
import { CategoriesService } from '@transactions/categories.service';
import { CashflowAnalyticsQueryDto } from '@transactions/dto/cashflow-analytics-query.dto';
import { CashflowMonthlyQueryDto } from '@transactions/dto/cashflow-monthly-query.dto';
import { CashflowSummaryQueryDto } from '@transactions/dto/cashflow-summary-query.dto';
import { TransactionsService } from '@transactions/transactions.service';
import type {
  CashflowAnalyticsPageDataResponse,
  CashflowAnalyticsResponse,
  CashflowSummaryResponse,
  MonthlyCashflowResponse,
} from '@finhance/shared';

@Controller('cashflow')
export class CashflowController {
  constructor(
    private readonly accountsService: AccountsService,
    private readonly categoriesService: CategoriesService,
    private readonly setupService: SetupService,
    private readonly transactionsService: TransactionsService,
    private readonly requestOwnerResolver: RequestOwnerResolver,
  ) {}

  private resolveOwnerId(): string {
    return this.requestOwnerResolver.resolveOwnerId();
  }

  private async readAnalytics(
    ownerId: string,
    query: CashflowAnalyticsQueryDto,
  ): Promise<CashflowAnalyticsResponse> {
    return this.transactionsService.getCashflowAnalytics(ownerId, {
      from: query.from,
      to: query.to,
      accountId: query.accountId,
      categoryId: query.categoryId,
      primaryCategoryId: query.primaryCategoryId,
      secondaryCategoryId: query.secondaryCategoryId,
      includeArchivedAccounts: query.includeArchivedAccounts,
    });
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
      categoryId: query.categoryId,
      primaryCategoryId: query.primaryCategoryId,
      secondaryCategoryId: query.secondaryCategoryId,
      includeArchivedAccounts: query.includeArchivedAccounts,
    });
  }

  @Get('analytics')
  @Throttle(createNamedThrottleOverride('analytics'))
  async getAnalytics(
    @Query() query: CashflowAnalyticsQueryDto,
  ): Promise<CashflowAnalyticsResponse> {
    return this.readAnalytics(this.resolveOwnerId(), query);
  }

  @Get('page-data')
  @Throttle(createNamedThrottleOverride('analytics'))
  async getPageData(
    @Query() query: CashflowAnalyticsQueryDto,
  ): Promise<CashflowAnalyticsPageDataResponse> {
    const ownerId = this.resolveOwnerId();
    const [analytics, accounts, categories, setup] = await Promise.all([
      this.readAnalytics(ownerId, query),
      this.accountsService.findAll(ownerId, { includeArchived: true }),
      this.categoriesService.findAll(ownerId, { includeArchived: true }),
      this.setupService
        .getStatus(ownerId, { includeWarnings: false })
        .catch(() => null),
    ]);
    const [accountDeletionStates, categoryDeletionStates] = await Promise.all([
      this.accountsService.getDeletionStates(
        ownerId,
        accounts.map((account) => account.id),
      ),
      this.categoriesService.getDeletionStates(
        ownerId,
        categories.map((category) => category.id),
      ),
    ]);

    return {
      analytics,
      accounts: accounts.map((account) =>
        toAccountResponse(account, accountDeletionStates.get(account.id)),
      ),
      categories: categories.map((category) =>
        toCategoryResponse(category, categoryDeletionStates.get(category.id)),
      ),
      setup,
    };
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
