import { Transform } from 'class-transformer';
import type { TransformFnParams } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsNotEmpty,
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
  @Transform(trimStringValue)
  description!: string;

  @IsOptional()
  @IsString()
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
