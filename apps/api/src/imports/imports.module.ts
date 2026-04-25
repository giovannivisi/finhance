import { Module } from '@nestjs/common';
import { LocalOnlyImportsGuard } from '@/security/local-only-imports.guard';
import { RequestOwnerResolver } from '@/security/request-owner.resolver';
import { ImportsController } from '@imports/imports.controller';
import { ImportsService } from '@imports/imports.service';
import { PricesModule } from '@prices/prices.module';
import { RecurringModule } from '@recurring/recurring.module';

@Module({
  imports: [PricesModule, RecurringModule],
  controllers: [ImportsController],
  providers: [ImportsService, RequestOwnerResolver, LocalOnlyImportsGuard],
})
export class ImportsModule {}
