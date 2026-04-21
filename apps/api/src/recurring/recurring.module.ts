import { Module } from '@nestjs/common';
import { AccountsModule } from '@accounts/accounts.module';
import { RequestOwnerResolver } from '@/security/request-owner.resolver';
import { RecurringController } from '@recurring/recurring.controller';
import { MonthlyReviewController } from '@recurring/monthly-review.controller';
import { RecurringService } from '@recurring/recurring.service';
import { TransactionsModule } from '@transactions/transactions.module';

@Module({
  imports: [AccountsModule, TransactionsModule],
  controllers: [RecurringController, MonthlyReviewController],
  providers: [RecurringService, RequestOwnerResolver],
  exports: [RecurringService],
})
export class RecurringModule {}
