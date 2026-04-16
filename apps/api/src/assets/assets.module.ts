import { Module } from '@nestjs/common';
import { AssetsService } from '@assets/assets.service';
import { AssetsController } from '@assets/assets.controller';
import { DashboardController } from '@assets/dashboard.controller';
import { PricesModule } from '@prices/prices.module';

@Module({
  imports: [PricesModule],
  controllers: [AssetsController, DashboardController],
  providers: [AssetsService],
})
export class AssetsModule {}
