import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { PrismaModule } from '@prisma/prisma.module';
import { AccountsModule } from '@accounts/accounts.module';
import { AssetsModule } from '@assets/assets.module';
import { RecurringModule } from '@recurring/recurring.module';
import { SnapshotsModule } from '@snapshots/snapshots.module';
import { TransactionsModule } from '@transactions/transactions.module';
import { ProxyAwareThrottlerGuard } from '@/security/proxy-aware-throttler.guard';

@Module({
  imports: [
    ThrottlerModule.forRoot([
      {
        name: 'default',
        ttl: 60_000,
        limit: 30,
      },
    ]),
    PrismaModule,
    AccountsModule,
    AssetsModule,
    RecurringModule,
    SnapshotsModule,
    TransactionsModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ProxyAwareThrottlerGuard,
    },
  ],
})
export class AppModule {}
