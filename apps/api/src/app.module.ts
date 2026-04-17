import { Module } from '@nestjs/common';
import { PrismaModule } from '@prisma/prisma.module';
import { AccountsModule } from '@accounts/accounts.module';
import { AssetsModule } from '@assets/assets.module';

@Module({
  imports: [PrismaModule, AccountsModule, AssetsModule],
})
export class AppModule {}
