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
import { CategoryType as PrismaCategoryType } from '@finhance/db';
import type { CategoryType, UpsertCategoryRequest } from '@finhance/shared';

function trimStringValue({ value }: TransformFnParams): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

function trimOptionalStringValue({ value }: TransformFnParams): unknown {
  return typeof value === 'string' ? value.trim() || undefined : value;
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
  @IsString()
  @IsNotEmpty()
  @Transform(trimOptionalStringValue)
  parentCategoryId?: string | null;

  @IsOptional()
  @IsInt()
  order?: number | null;
}
