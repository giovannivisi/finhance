import { Controller, Get, Post, Body } from '@nestjs/common';
import { CategoriesService } from '@categories/categories.service';

@Controller('categories')
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @Get()
  findAll() {
    return this.categoriesService.findAll();
  }

  @Post()
  create(@Body('name') name: string) {
    return this.categoriesService.create(name);
  }
}