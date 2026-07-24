import { Module } from '@nestjs/common';
import { MARKET_DATA_PROVIDER } from '@prices/market-data-provider';
import { createMarketDataProvider } from '@prices/market-data-provider.factory';
import { MarketDataRateLimitService } from '@prices/market-data-rate-limit.service';
import { PricesService } from '@prices/prices.service';

@Module({
  providers: [
    MarketDataRateLimitService,
    {
      provide: MARKET_DATA_PROVIDER,
      useFactory: (rateLimit: MarketDataRateLimitService) =>
        createMarketDataProvider(process.env, rateLimit),
      inject: [MarketDataRateLimitService],
    },
    PricesService,
  ],
  exports: [PricesService],
})
export class PricesModule {}
