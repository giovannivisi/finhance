import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { RequestOwnerResolver } from '@/security/request-owner.resolver';
import { CategoriesService } from '@transactions/categories.service';
import { toCategoryResponse } from '@transactions/categories.mapper';
import { CreateCategoryDto } from '@transactions/dto/create-category.dto';
import { ListCategoriesQueryDto } from '@transactions/dto/list-categories-query.dto';
import { UpdateCategoryDto } from '@transactions/dto/update-category.dto';
import type { CategoryResponse } from '@finhance/shared';

@Controller('categories')
export class CategoriesController {
  constructor(
    private readonly categoriesService: CategoriesService,
    private readonly requestOwnerResolver: RequestOwnerResolver,
  ) {}

  private resolveOwnerId(): string {
    return this.requestOwnerResolver.resolveOwnerId();
  }

  @Get()
  async findAll(
    @Query() query: ListCategoriesQueryDto,
  ): Promise<CategoryResponse[]> {
    const categories = await this.categoriesService.findAll(
      this.resolveOwnerId(),
      {
        includeArchived: query.includeArchived ?? false,
      },
    );
    const deletionStates = await this.categoriesService.getDeletionStates(
      this.resolveOwnerId(),
      categories.map((category) => category.id),
    );
    return categories.map((category) =>
      toCategoryResponse(category, deletionStates.get(category.id)),
    );
  }

  @Post()
  async create(@Body() dto: CreateCategoryDto): Promise<CategoryResponse> {
    const category = await this.categoriesService.create(
      this.resolveOwnerId(),
      dto,
    );
    const deletionState = (
      await this.categoriesService.getDeletionStates(this.resolveOwnerId(), [
        category.id,
      ])
    ).get(category.id);
    return toCategoryResponse(category, deletionState);
  }

  @Post(':id/unarchive')
  async unarchive(@Param('id') id: string): Promise<CategoryResponse> {
    const category = await this.categoriesService.unarchive(
      this.resolveOwnerId(),
      id,
    );
    const deletionState = (
      await this.categoriesService.getDeletionStates(this.resolveOwnerId(), [
        id,
      ])
    ).get(id);
    return toCategoryResponse(category, deletionState);
  }

  @Get(':id')
  async findOne(@Param('id') id: string): Promise<CategoryResponse> {
    const category = await this.categoriesService.findOne(
      this.resolveOwnerId(),
      id,
    );
    const deletionState = (
      await this.categoriesService.getDeletionStates(this.resolveOwnerId(), [
        id,
      ])
    ).get(id);
    return toCategoryResponse(category, deletionState);
  }

  @Put(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateCategoryDto,
  ): Promise<CategoryResponse> {
    const category = await this.categoriesService.update(
      this.resolveOwnerId(),
      id,
      dto,
    );
    const deletionState = (
      await this.categoriesService.getDeletionStates(this.resolveOwnerId(), [
        id,
      ])
    ).get(id);
    return toCategoryResponse(category, deletionState);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@Param('id') id: string): Promise<void> {
    return this.categoriesService.remove(this.resolveOwnerId(), id);
  }

  @Delete(':id/permanent')
  @HttpCode(204)
  async permanentlyDelete(@Param('id') id: string): Promise<void> {
    return this.categoriesService.permanentlyDelete(this.resolveOwnerId(), id);
  }
}
