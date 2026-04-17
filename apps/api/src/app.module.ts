import { Module } from '@nestjs/common';
import { PrismaModule } from '@prisma/prisma.module';
import { AccountsModule } from '@accounts/accounts.module';
import { AssetsModule } from '@assets/assets.module';
import { SnapshotsModule } from '@snapshots/snapshots.module';
import { TransactionsModule } from '@transactions/transactions.module';

@Module({
  imports: [
    PrismaModule,
    AccountsModule,
    AssetsModule,
    SnapshotsModule,
    TransactionsModule,
  ],
})
export class AppModule {}
