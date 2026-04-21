import { forwardRef, Module } from '@nestjs/common';
import { AccountsController } from '@accounts/accounts.controller';
import { AccountsService } from '@accounts/accounts.service';
import { PricesModule } from '@prices/prices.module';
import { RequestOwnerResolver } from '@/security/request-owner.resolver';
import { TransactionsModule } from '@transactions/transactions.module';

@Module({
  imports: [PricesModule, forwardRef(() => TransactionsModule)],
  controllers: [AccountsController],
  providers: [AccountsService, RequestOwnerResolver],
  exports: [AccountsService],
})
export class AccountsModule {}
