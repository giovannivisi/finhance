import { Module } from '@nestjs/common';
import { AccountsController } from '@accounts/accounts.controller';
import { AccountsService } from '@accounts/accounts.service';
import { PricesModule } from '@prices/prices.module';
import { RequestOwnerResolver } from '@/security/request-owner.resolver';

@Module({
  imports: [PricesModule],
  controllers: [AccountsController],
  providers: [AccountsService, RequestOwnerResolver],
  exports: [AccountsService],
})
export class AccountsModule {}
