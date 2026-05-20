import { Module } from '@nestjs/common';
import { AccountsModule } from '@accounts/accounts.module';
import { AssetsModule } from '@assets/assets.module';
import { BrokerageController } from '@brokerage/brokerage.controller';
import { BrokerageService } from '@brokerage/brokerage.service';
import { RequestOwnerResolver } from '@/security/request-owner.resolver';
import { TransactionsModule } from '@transactions/transactions.module';

@Module({
  imports: [AccountsModule, AssetsModule, TransactionsModule],
  controllers: [BrokerageController],
  providers: [BrokerageService, RequestOwnerResolver],
  exports: [BrokerageService],
})
export class BrokerageModule {}
