import { Module } from '@nestjs/common';
import { AccountsModule } from '@accounts/accounts.module';
import { AssetsService } from '@assets/assets.service';
import { AssetsController } from '@assets/assets.controller';
import { PricesModule } from '@prices/prices.module';
import { RequestOwnerResolver } from '@/security/request-owner.resolver';

@Module({
  imports: [PricesModule, AccountsModule],
  controllers: [AssetsController],
  providers: [AssetsService, RequestOwnerResolver],
  exports: [AssetsService],
})
export class AssetsModule {}
