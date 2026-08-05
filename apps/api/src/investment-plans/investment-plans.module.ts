import { Module } from '@nestjs/common';
import { BrokerageModule } from '@brokerage/brokerage.module';
import { RequestOwnerResolver } from '@/security/request-owner.resolver';
import { InvestmentPlansController } from '@investment-plans/investment-plans.controller';
import { InvestmentPlansService } from '@investment-plans/investment-plans.service';

@Module({
  imports: [BrokerageModule],
  controllers: [InvestmentPlansController],
  providers: [InvestmentPlansService, RequestOwnerResolver],
  exports: [InvestmentPlansService],
})
export class InvestmentPlansModule {}
