import { Transform } from 'class-transformer';
import type { TransformFnParams } from 'class-transformer';
import { IsOptional, IsString, Matches } from 'class-validator';

const LOCAL_MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

function trimOptionalStringValue({ value }: TransformFnParams): unknown {
  return typeof value === 'string' ? value.trim() || undefined : value;
}

export class FindCategoryBudgetOverridesQueryDto {
  @IsOptional()
  @IsString()
  @Matches(LOCAL_MONTH_PATTERN)
  @Transform(trimOptionalStringValue)
  from?: string;

  @IsOptional()
  @IsString()
  @Matches(LOCAL_MONTH_PATTERN)
  @Transform(trimOptionalStringValue)
  to?: string;
}
