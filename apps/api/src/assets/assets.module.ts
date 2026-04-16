import { Module } from '@nestjs/common';
import { AssetsService } from '@assets/assets.service';
import { AssetsController } from '@assets/assets.controller';
import { DashboardController } from '@assets/dashboard.controller';
import { PricesModule } from '@prices/prices.module';
import { REFRESH_COOLDOWN_MS } from '@assets/assets.types';
import { RequestOwnerResolver } from '@/security/request-owner.resolver';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';

@Module({
  imports: [
    PricesModule,
    ThrottlerModule.forRoot([
      {
        name: 'default',
        ttl: REFRESH_COOLDOWN_MS,
        limit: 60,
      },
    ]),
  ],
  controllers: [AssetsController, DashboardController],
  providers: [AssetsService, RequestOwnerResolver, ThrottlerGuard],
})
export class AssetsModule {}
