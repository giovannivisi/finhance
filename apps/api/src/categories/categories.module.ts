import { Module } from '@nestjs/common';
import { CategoriesService } from '@categories/categories.service';
import { CategoriesController } from '@categories/categories.controller';

@Module({
  providers: [CategoriesService],
  controllers: [CategoriesController]
})
export class CategoriesModule {}
