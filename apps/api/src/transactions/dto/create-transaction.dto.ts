import { Transform } from 'class-transformer';
import type { TransformFnParams } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsNotEmpty,
  MaxLength,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
} from 'class-validator';
import {
  TransactionDirection as PrismaTransactionDirection,
  TransactionKind as PrismaTransactionKind,
} from '@prisma/client';
import type { TransactionDirection, TransactionKind } from '@finhance/shared';

function trimStringValue({ value }: TransformFnParams): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

function trimOptionalStringValue({ value }: TransformFnParams): unknown {
  return typeof value === 'string' ? value.trim() || undefined : value;
}

const TRANSACTION_DESCRIPTION_MAX_LENGTH = 240;
const TRANSACTION_COUNTERPARTY_MAX_LENGTH = 120;
const TRANSACTION_NOTES_MAX_LENGTH = 2_000;

export class CreateTransactionDto {
  @IsDateString()
  postedAt!: string;

  @IsEnum(PrismaTransactionKind)
  kind!: TransactionKind;

  @IsNumber()
  @IsPositive()
  amount!: number;

  @IsString()
  @IsNotEmpty()
  @MaxLength(TRANSACTION_DESCRIPTION_MAX_LENGTH)
  @Transform(trimStringValue)
  description!: string;

  @IsOptional()
  @IsString()
  @MaxLength(TRANSACTION_NOTES_MAX_LENGTH)
  @Transform(trimOptionalStringValue)
  notes?: string | null;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @Transform(trimOptionalStringValue)
  accountId?: string | null;

  @IsOptional()
  @IsEnum(PrismaTransactionDirection)
  direction?: TransactionDirection | null;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @Transform(trimOptionalStringValue)
  categoryId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(TRANSACTION_COUNTERPARTY_MAX_LENGTH)
  @Transform(trimOptionalStringValue)
  counterparty?: string | null;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @Transform(trimOptionalStringValue)
  sourceAccountId?: string | null;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @Transform(trimOptionalStringValue)
  destinationAccountId?: string | null;
}
