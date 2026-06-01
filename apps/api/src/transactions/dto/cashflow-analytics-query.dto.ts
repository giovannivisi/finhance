import { Transform } from 'class-transformer';
import type { TransformFnParams } from 'class-transformer';
import { IsBoolean, IsOptional, IsString, Matches } from 'class-validator';

const LOCAL_MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

function trimOptionalStringValue({ value }: TransformFnParams): unknown {
  return typeof value === 'string' ? value.trim() || undefined : value;
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

export class CashflowAnalyticsQueryDto {
  @IsString()
  @Matches(LOCAL_MONTH_PATTERN)
  @Transform(trimOptionalStringValue)
  from!: string;

  @IsString()
  @Matches(LOCAL_MONTH_PATTERN)
  @Transform(trimOptionalStringValue)
  to!: string;

  @IsOptional()
  @IsString()
  @Transform(trimOptionalStringValue)
  accountId?: string;

  @IsOptional()
  @IsString()
  @Transform(trimOptionalStringValue)
  categoryId?: string;

  @IsOptional()
  @Transform(booleanValue)
  @IsBoolean()
  includeArchivedAccounts?: boolean;
}
