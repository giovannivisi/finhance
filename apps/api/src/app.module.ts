import { Module } from '@nestjs/common';
import { PrismaModule } from '@/prisma/prisma.module';
import { AccountsModule } from '@/accounts/accounts.module';

@Module({
  imports: [PrismaModule, AccountsModule],
})
export class AppModule {}
