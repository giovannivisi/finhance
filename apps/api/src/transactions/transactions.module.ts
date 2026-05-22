import { forwardRef, Module } from '@nestjs/common';
import { AccountsModule } from '@accounts/accounts.module';
import { PricesModule } from '@prices/prices.module';
import { RequestOwnerResolver } from '@/security/request-owner.resolver';
import { CashflowController } from '@transactions/cashflow.controller';
import { CategoriesController } from '@transactions/categories.controller';
import { CategoriesService } from '@transactions/categories.service';
import { ExpenseValidationController } from '@transactions/expense-validation.controller';
import { ExpenseValidationService } from '@transactions/expense-validation.service';
import { TransactionsController } from '@transactions/transactions.controller';
import { TransactionsService } from '@transactions/transactions.service';

@Module({
  imports: [forwardRef(() => AccountsModule), PricesModule],
  controllers: [
    CashflowController,
    CategoriesController,
    ExpenseValidationController,
    TransactionsController,
  ],
  providers: [
    CategoriesService,
    ExpenseValidationService,
    TransactionsService,
    RequestOwnerResolver,
  ],
  exports: [CategoriesService, ExpenseValidationService, TransactionsService],
})
export class TransactionsModule {}
