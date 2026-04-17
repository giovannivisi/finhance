import { Module } from '@nestjs/common';
import { PricesService } from '@prices/prices.service';

@Module({
  providers: [PricesService],
  exports: [PricesService],
})
export class PricesModule {}
