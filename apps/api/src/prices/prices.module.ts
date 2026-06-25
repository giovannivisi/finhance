import { Module } from '@nestjs/common';
import { MARKET_DATA_PROVIDER } from '@prices/market-data-provider';
import { createMarketDataProvider } from '@prices/market-data-provider.factory';
import { PricesService } from '@prices/prices.service';

@Module({
  providers: [
    {
      provide: MARKET_DATA_PROVIDER,
      useFactory: createMarketDataProvider,
    },
    PricesService,
  ],
  exports: [PricesService],
})
export class PricesModule {}
