import { Module } from '@nestjs/common';
import { LocalOnlyImportsGuard } from '@/security/local-only-imports.guard';
import { RequestOwnerResolver } from '@/security/request-owner.resolver';
import { ImportsController } from '@imports/imports.controller';
import { ImportsService } from '@imports/imports.service';
import { PricesModule } from '@prices/prices.module';

@Module({
  imports: [PricesModule],
  controllers: [ImportsController],
  providers: [ImportsService, RequestOwnerResolver, LocalOnlyImportsGuard],
})
export class ImportsModule {}
