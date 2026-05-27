import { Injectable } from '@nestjs/common';
import { AccountsService } from '@accounts/accounts.service';
import { toAccountResponse } from '@accounts/accounts.mapper';
import { AssetsService } from '@assets/assets.service';
import { BudgetsService } from '@budgets/budgets.service';
import { SetupService } from '@/setup/setup.service';
import type {
  DashboardPageDataResponse,
  DashboardResponse,
  DashboardSupportDataResponse,
} from '@finhance/shared';
import { utcDateToRomeMonth } from '@transactions/transactions.dates';

@Injectable()
export class DashboardService {
  constructor(
    private readonly accountsService: AccountsService,
    private readonly assetsService: AssetsService,
    private readonly budgetsService: BudgetsService,
    private readonly setupService: SetupService,
  ) {}

  async getDashboard(ownerId: string): Promise<DashboardResponse> {
    const dashboard = await this.assetsService.getDashboard(ownerId);

    return {
      ...dashboard,
      latestSnapshotDate: null,
      latestSnapshotCapturedAt: null,
      latestSnapshotIsPartial: null,
    };
  }

  async getPageData(ownerId: string): Promise<DashboardPageDataResponse> {
    const currentMonth = utcDateToRomeMonth(new Date());
    const [dashboard, budgetView, accounts, setup] = await Promise.all([
      this.getDashboard(ownerId),
      this.budgetsService.findMonthly(ownerId, currentMonth),
      this.accountsService.findAll(ownerId),
      this.setupService
        .getStatus(ownerId, { includeWarnings: false })
        .catch(() => null),
    ]);

    return {
      dashboard,
      budgetView,
      accounts: accounts.map((account) => toAccountResponse(account)),
      setup,
    };
  }

  async getSupportData(ownerId: string): Promise<DashboardSupportDataResponse> {
    const currentMonth = utcDateToRomeMonth(new Date());
    const [budgetView, setup] = await Promise.all([
      this.budgetsService.findMonthly(ownerId, currentMonth),
      this.setupService
        .getStatus(ownerId, { includeWarnings: false })
        .catch(() => null),
    ]);

    return {
      budgetView,
      setup,
    };
  }
}
