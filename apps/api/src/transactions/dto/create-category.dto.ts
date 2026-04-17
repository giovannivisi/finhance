import { Transform } from 'class-transformer';
import type { TransformFnParams } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';
import { CategoryType as PrismaCategoryType } from '@prisma/client';
import type { CategoryType, UpsertCategoryRequest } from '@finhance/shared';

function trimStringValue({ value }: TransformFnParams): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

export class CreateCategoryDto implements UpsertCategoryRequest {
  @IsString()
  @IsNotEmpty()
  @Transform(trimStringValue)
  name!: string;

  @IsEnum(PrismaCategoryType)
  type!: CategoryType;

  @IsOptional()
  @IsInt()
  order?: number | null;
}
