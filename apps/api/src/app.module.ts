import { Module } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { PrismaModule } from '@prisma/prisma.module';
import { AccountsModule } from '@accounts/accounts.module';
import { AssetsModule } from '@assets/assets.module';
import { RecurringModule } from '@recurring/recurring.module';
import { ImportsModule } from '@imports/imports.module';
import { DashboardModule } from '@/dashboard/dashboard.module';
import { SnapshotsModule } from '@snapshots/snapshots.module';
import { TransactionsModule } from '@transactions/transactions.module';
import { LocalOnlyGuard } from '@/security/local-only.guard';
import { ProxyAwareThrottlerGuard } from '@/security/proxy-aware-throttler.guard';
import { RequestSafetyModule } from '@/request-safety/request-safety.module';
import { IdempotencyInterceptor } from '@/request-safety/idempotency.interceptor';

@Module({
  imports: [
    ThrottlerModule.forRoot([
      {
        name: 'monthlyCashflow',
        ttl: 60_000,
        limit: 5,
      },
    ]),
    PrismaModule,
    RequestSafetyModule,
    AccountsModule,
    AssetsModule,
    RecurringModule,
    ImportsModule,
    DashboardModule,
    SnapshotsModule,
    TransactionsModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: LocalOnlyGuard,
    },
    {
      provide: APP_GUARD,
      useClass: ProxyAwareThrottlerGuard,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: IdempotencyInterceptor,
    },
  ],
})
export class AppModule {}
