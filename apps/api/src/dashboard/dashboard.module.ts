import { Module } from '@nestjs/common';
import { AccountsModule } from '@accounts/accounts.module';
import { AssetsModule } from '@assets/assets.module';
import { BudgetsModule } from '@budgets/budgets.module';
import { RequestOwnerResolver } from '@/security/request-owner.resolver';
import { SetupModule } from '@/setup/setup.module';
import { DashboardController } from '@/dashboard/dashboard.controller';
import { DashboardService } from '@/dashboard/dashboard.service';

@Module({
  imports: [AccountsModule, AssetsModule, BudgetsModule, SetupModule],
  controllers: [DashboardController],
  providers: [DashboardService, RequestOwnerResolver],
})
export class DashboardModule {}
