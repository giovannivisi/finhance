import { Controller, Get, Query } from '@nestjs/common';
import { RequestOwnerResolver } from '@/security/request-owner.resolver';
import type { MonthlyReviewResponse } from '@finhance/shared';
import { FindMonthlyReviewQueryDto } from '@recurring/dto/find-monthly-review-query.dto';
import { RecurringService } from '@recurring/recurring.service';

@Controller('monthly-review')
export class MonthlyReviewController {
  constructor(
    private readonly recurringService: RecurringService,
    private readonly requestOwnerResolver: RequestOwnerResolver,
  ) {}

  private resolveOwnerId(): string {
    return this.requestOwnerResolver.resolveOwnerId();
  }

  @Get()
  async findOne(
    @Query() query: FindMonthlyReviewQueryDto,
  ): Promise<MonthlyReviewResponse> {
    return this.recurringService.getMonthlyReview(
      this.resolveOwnerId(),
      query.month,
    );
  }
}
