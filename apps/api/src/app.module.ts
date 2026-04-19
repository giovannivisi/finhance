import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { PrismaModule } from '@prisma/prisma.module';
import { AccountsModule } from '@accounts/accounts.module';
import { AssetsModule } from '@assets/assets.module';
import { DashboardModule } from '@/dashboard/dashboard.module';
import { SnapshotsModule } from '@snapshots/snapshots.module';
import { TransactionsModule } from '@transactions/transactions.module';
import { LocalOnlyGuard } from '@/security/local-only.guard';
import { ProxyAwareThrottlerGuard } from '@/security/proxy-aware-throttler.guard';

@Module({
  imports: [
    ThrottlerModule.forRoot([
      {
        name: 'default',
        ttl: 60_000,
        limit: 30,
      },
      {
        name: 'monthlyCashflow',
        ttl: 60_000,
        limit: 5,
      },
    ]),
    PrismaModule,
    AccountsModule,
    AssetsModule,
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
  ],
})
export class AppModule {}
