import { Controller, Get, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { createNamedThrottleOverride } from '@/config/throttle.config';
import { RequestOwnerResolver } from '@/security/request-owner.resolver';
import { SetupService } from '@/setup/setup.service';
import type {
  MonthlyReviewPageDataResponse,
  MonthlyReviewResponse,
} from '@finhance/shared';
import { FindMonthlyReviewQueryDto } from '@recurring/dto/find-monthly-review-query.dto';
import { RecurringService } from '@recurring/recurring.service';

@Controller('monthly-review')
export class MonthlyReviewController {
  constructor(
    private readonly recurringService: RecurringService,
    private readonly setupService: SetupService,
    private readonly requestOwnerResolver: RequestOwnerResolver,
  ) {}

  private resolveOwnerId(): string {
    return this.requestOwnerResolver.resolveOwnerId();
  }

  @Get()
  @Throttle(createNamedThrottleOverride('analytics'))
  async findOne(
    @Query() query: FindMonthlyReviewQueryDto,
  ): Promise<MonthlyReviewResponse> {
    return this.recurringService.getMonthlyReview(
      this.resolveOwnerId(),
      query.month,
    );
  }

  @Get('page-data')
  @Throttle(createNamedThrottleOverride('analytics'))
  async getPageData(
    @Query() query: FindMonthlyReviewQueryDto,
  ): Promise<MonthlyReviewPageDataResponse> {
    const ownerId = this.resolveOwnerId();
    const [review, setup, hasPendingSync] = await Promise.all([
      this.recurringService.getMonthlyReview(ownerId, query.month),
      this.setupService
        .getStatus(ownerId, { includeWarnings: false })
        .catch(() => null),
      this.recurringService
        .hasPendingMaterializations(ownerId)
        .catch(() => false),
    ]);

    return {
      review,
      setup,
      hasPendingSync,
    };
  }
}
