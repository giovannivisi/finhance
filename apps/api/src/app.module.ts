import { Module } from '@nestjs/common';
import { PrismaModule } from '@prisma/prisma.module';
import { AccountsModule } from '@accounts/accounts.module';
import { CategoriesModule } from '@categories/categories.module';

@Module({
  imports: [PrismaModule, AccountsModule, CategoriesModule],
})
export class AppModule {}
