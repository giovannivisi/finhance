import { Module } from '@nestjs/common';
import { AccountsModule } from '@accounts/accounts.module';
import { BudgetsModule } from '@budgets/budgets.module';
import { RequestOwnerResolver } from '@/security/request-owner.resolver';
import { SetupModule } from '@/setup/setup.module';
import { RecurringController } from '@recurring/recurring.controller';
import { MonthlyReviewController } from '@recurring/monthly-review.controller';
import { RecurringService } from '@recurring/recurring.service';
import { TransactionsModule } from '@transactions/transactions.module';

@Module({
  imports: [AccountsModule, BudgetsModule, TransactionsModule, SetupModule],
  controllers: [RecurringController, MonthlyReviewController],
  providers: [RecurringService, RequestOwnerResolver],
  exports: [RecurringService],
})
export class RecurringModule {}
