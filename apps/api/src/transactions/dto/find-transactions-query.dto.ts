import { Transform } from 'class-transformer';
import type { TransformFnParams } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  Max,
  Min,
  IsOptional,
  IsString,
  Matches,
} from 'class-validator';
import { TransactionKind as PrismaTransactionKind } from '@prisma/client';
import type { TransactionKind } from '@finhance/shared';

const LOCAL_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MAX_QUERY_LIMIT = 500;
const MAX_QUERY_OFFSET = 1_000;

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

function integerValue({ value }: TransformFnParams): unknown {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value === 'number') {
    return Number.isInteger(value) ? value : value;
  }

  if (typeof value === 'string' && value.trim() !== '') {
    return Number(value);
  }

  return value;
}

export class FindTransactionsQueryDto {
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
  @IsEnum(PrismaTransactionKind)
  kind?: TransactionKind;

  @IsOptional()
  @Transform(booleanValue)
  @IsBoolean()
  includeArchivedAccounts?: boolean;

  @IsOptional()
  @Transform(integerValue)
  @IsInt()
  @Min(1)
  @Max(MAX_QUERY_LIMIT)
  limit?: number;

  @IsOptional()
  @Transform(integerValue)
  @IsInt()
  @Min(0)
  @Max(MAX_QUERY_OFFSET)
  offset?: number;
}
