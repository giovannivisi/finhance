import { Transform } from 'class-transformer';
import type { TransformFnParams } from 'class-transformer';
import {
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
import {
  RecurringOccurrenceStatus as PrismaRecurringOccurrenceStatus,
  TransactionDirection as PrismaTransactionDirection,
} from '@prisma/client';

function trimOptionalStringValue({ value }: TransformFnParams): unknown {
  return typeof value === 'string' ? value.trim() || undefined : value;
}

const OCCURRENCE_DESCRIPTION_MAX_LENGTH = 240;
const OCCURRENCE_COUNTERPARTY_MAX_LENGTH = 120;
const OCCURRENCE_NOTES_MAX_LENGTH = 2_000;

export class UpsertRecurringOccurrenceDto {
  @IsEnum(PrismaRecurringOccurrenceStatus)
  status!: PrismaRecurringOccurrenceStatus;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  amount?: number;

  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  @Transform(trimOptionalStringValue)
  postedAtDate?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @Transform(trimOptionalStringValue)
  accountId?: string;

  @IsOptional()
  @IsEnum(PrismaTransactionDirection)
  direction?: PrismaTransactionDirection;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @Transform(trimOptionalStringValue)
  categoryId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(OCCURRENCE_COUNTERPARTY_MAX_LENGTH)
  @Transform(trimOptionalStringValue)
  counterparty?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @Transform(trimOptionalStringValue)
  sourceAccountId?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @Transform(trimOptionalStringValue)
  destinationAccountId?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(OCCURRENCE_DESCRIPTION_MAX_LENGTH)
  @Transform(trimOptionalStringValue)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(OCCURRENCE_NOTES_MAX_LENGTH)
  @Transform(trimOptionalStringValue)
  notes?: string;
}
