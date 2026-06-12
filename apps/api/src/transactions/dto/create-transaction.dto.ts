import { Transform } from 'class-transformer';
import { Type } from 'class-transformer';
import type { TransformFnParams } from 'class-transformer';
import {
  ArrayMinSize,
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsArray,
  MaxLength,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  ValidateNested,
} from 'class-validator';
import {
  TransactionDirection as PrismaTransactionDirection,
  FxRateSource as PrismaFxRateSource,
  TransactionKind as PrismaTransactionKind,
} from '@finhance/db';
import { IsSupportedCurrencyCode } from '@/common/catalog-validators';
import type {
  FxRateSource,
  TransactionDirection,
  TransactionKind,
} from '@finhance/shared';

function trimStringValue({ value }: TransformFnParams): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

function trimOptionalStringValue({ value }: TransformFnParams): unknown {
  return typeof value === 'string' ? value.trim() || undefined : value;
}

const TRANSACTION_DESCRIPTION_MAX_LENGTH = 240;
const TRANSACTION_COUNTERPARTY_MAX_LENGTH = 120;
const TRANSACTION_NOTES_MAX_LENGTH = 2_000;

export class SplitTransactionFundingLegDto {
  @IsString()
  @IsNotEmpty()
  @Transform(trimStringValue)
  accountId!: string;

  @IsNumber()
  @IsPositive()
  amount!: number;
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

  @IsOptional()
  @IsArray()
  @ArrayMinSize(2)
  @ValidateNested({ each: true })
  @Type(() => SplitTransactionFundingLegDto)
  fundingLegs?: SplitTransactionFundingLegDto[] | null;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  nativeAmount?: number | null;

  @IsOptional()
  @IsString()
  @IsSupportedCurrencyCode()
  @Transform(trimOptionalStringValue)
  nativeCurrency?: string | null;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  fxRateUsed?: number | null;

  @IsOptional()
  @IsEnum(PrismaFxRateSource)
  fxRateSource?: FxRateSource | null;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  sourceAmount?: number | null;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  destinationAmount?: number | null;

  @IsOptional()
  @IsString()
  @IsSupportedCurrencyCode()
  @Transform(trimOptionalStringValue)
  sourceCurrency?: string | null;

  @IsOptional()
  @IsString()
  @IsSupportedCurrencyCode()
  @Transform(trimOptionalStringValue)
  destinationCurrency?: string | null;
}
