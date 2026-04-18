import { Transform } from 'class-transformer';
import type { TransformFnParams } from 'class-transformer';
import {
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
  Matches,
} from 'class-validator';

const LOCAL_MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

function trimStringValue({ value }: TransformFnParams): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

function optionalStringArrayValue({ value }: TransformFnParams): unknown {
  if (value === undefined) {
    return undefined;
  }

  const values = Array.isArray(value) ? value : [value];
  const normalized = values
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);

  return normalized.length > 0 ? normalized : undefined;
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

export class CashflowMonthlyQueryDto {
  @IsString()
  @Matches(LOCAL_MONTH_PATTERN)
  @Transform(trimStringValue)
  from!: string;

  @IsString()
  @Matches(LOCAL_MONTH_PATTERN)
  @Transform(trimStringValue)
  to!: string;

  @IsOptional()
  @Transform(optionalStringArrayValue)
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  accountId?: string[];

  @IsOptional()
  @Transform(booleanValue)
  @IsBoolean()
  includeArchivedAccounts?: boolean;
}
