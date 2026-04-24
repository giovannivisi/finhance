import { Transform } from 'class-transformer';
import type { TransformFnParams } from 'class-transformer';
import { IsNumber, IsOptional, IsString, Matches, Min } from 'class-validator';

const LOCAL_MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

function trimStringValue({ value }: TransformFnParams): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

function trimOptionalStringValue({ value }: TransformFnParams): unknown {
  return typeof value === 'string' ? value.trim() || undefined : value;
}

export class UpdateCategoryBudgetDto {
  @IsNumber()
  @Min(0)
  amount!: number;

  @IsString()
  @Matches(LOCAL_MONTH_PATTERN)
  @Transform(trimStringValue)
  effectiveMonth!: string;

  @IsOptional()
  @IsString()
  @Matches(LOCAL_MONTH_PATTERN)
  @Transform(trimOptionalStringValue)
  endMonth?: string | null;
}
