import { Transform } from 'class-transformer';
import type { TransformFnParams } from 'class-transformer';
import { IsBoolean, IsOptional, IsString, Matches } from 'class-validator';

const LOCAL_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

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
    return value.trim().toLowerCase() === 'true';
  }

  return value;
}

export class CashflowSummaryQueryDto {
  @IsOptional()
  @IsString()
  @Matches(LOCAL_DATE_PATTERN)
  @Transform(trimOptionalStringValue)
  from?: string;

  @IsOptional()
  @IsString()
  @Matches(LOCAL_DATE_PATTERN)
  @Transform(trimOptionalStringValue)
  to?: string;

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
