import { Transform } from 'class-transformer';
import type { TransformFnParams } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  MaxLength,
  IsOptional,
  IsString,
} from 'class-validator';
import { CategoryType as PrismaCategoryType } from '@prisma/client';
import type { CategoryType, UpsertCategoryRequest } from '@finhance/shared';

function trimStringValue({ value }: TransformFnParams): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

const CATEGORY_NAME_MAX_LENGTH = 120;

export class CreateCategoryDto implements UpsertCategoryRequest {
  @IsString()
  @IsNotEmpty()
  @MaxLength(CATEGORY_NAME_MAX_LENGTH)
  @Transform(trimStringValue)
  name!: string;

  @IsEnum(PrismaCategoryType)
  type!: CategoryType;

  @IsOptional()
  @IsInt()
  order?: number | null;
}
