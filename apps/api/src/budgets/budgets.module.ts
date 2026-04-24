import { Module } from '@nestjs/common';
import { RequestOwnerResolver } from '@/security/request-owner.resolver';
import { BudgetsController } from '@budgets/budgets.controller';
import { BudgetsService } from '@budgets/budgets.service';
import { TransactionsModule } from '@transactions/transactions.module';

@Module({
  imports: [TransactionsModule],
  controllers: [BudgetsController],
  providers: [BudgetsService, RequestOwnerResolver],
  exports: [BudgetsService],
})
export class BudgetsModule {}
