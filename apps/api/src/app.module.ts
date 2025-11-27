import { Module } from '@nestjs/common';
import { PrismaModule } from '@prisma/prisma.module';
import { AssetsModule } from '@assets/assets.module';
import { CategoriesModule } from '@categories/categories.module';

@Module({
  imports: [PrismaModule, AssetsModule, CategoriesModule],
})
export class AppModule {}
