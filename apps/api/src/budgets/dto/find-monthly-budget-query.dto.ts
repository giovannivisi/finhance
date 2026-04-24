import { Transform } from 'class-transformer';
import type { TransformFnParams } from 'class-transformer';
import { IsBoolean, IsOptional, IsString, Matches } from 'class-validator';

const LOCAL_MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

function trimStringValue({ value }: TransformFnParams): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

function booleanValue({ value }: TransformFnParams): unknown {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true') {
      return true;
    }

    if (normalized === 'false') {
      return false;
    }
  }

  return value;
}

export class FindMonthlyBudgetQueryDto {
  @IsString()
  @Matches(LOCAL_MONTH_PATTERN)
  @Transform(trimStringValue)
  month!: string;

  @IsOptional()
  @Transform(booleanValue)
  @IsBoolean()
  includeArchivedCategories?: boolean;
}
