import { Transform } from 'class-transformer';
import type { TransformFnParams } from 'class-transformer';
import {
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

function trimOptionalStringValue({ value }: TransformFnParams): unknown {
  return typeof value === 'string' ? value.trim() || undefined : value;
}

export class UpsertCategoryBudgetOverrideDto {
  @IsNumber()
  @Min(0)
  amount!: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  @Transform(trimOptionalStringValue)
  note?: string | null;
}
