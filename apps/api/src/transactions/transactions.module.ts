import { Module } from '@nestjs/common';
import { AccountsModule } from '@accounts/accounts.module';
import { RequestOwnerResolver } from '@/security/request-owner.resolver';
import { CashflowController } from '@transactions/cashflow.controller';
import { CategoriesController } from '@transactions/categories.controller';
import { CategoriesService } from '@transactions/categories.service';
import { TransactionsController } from '@transactions/transactions.controller';
import { TransactionsService } from '@transactions/transactions.service';

@Module({
  imports: [AccountsModule],
  controllers: [
    CashflowController,
    CategoriesController,
    TransactionsController,
  ],
  providers: [CategoriesService, TransactionsService, RequestOwnerResolver],
  exports: [CategoriesService, TransactionsService],
})
export class TransactionsModule {}
