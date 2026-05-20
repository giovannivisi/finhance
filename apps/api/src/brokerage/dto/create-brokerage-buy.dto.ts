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
  Matches,
  MaxLength,
} from 'class-validator';
import { AssetKind as PrismaAssetKind } from '@finhance/db';
import type { AssetKind, CreateBrokerageBuyRequest } from '@finhance/shared';

function trimOptionalStringValue({ value }: TransformFnParams): unknown {
  return typeof value === 'string' ? value.trim() || undefined : value;
}

function uppercaseOptionalStringValue({ value }: TransformFnParams): unknown {
  return typeof value === 'string'
    ? value.trim().toUpperCase() || undefined
    : value;
}

const NAME_MAX_LENGTH = 120;
const TICKER_MAX_LENGTH = 32;
const EXCHANGE_MAX_LENGTH = 24;
const NOTES_MAX_LENGTH = 2_000;
const MARKET_SYMBOL_PATTERN = /^[A-Z0-9.=-]+$/;
const EXCHANGE_PATTERN = /^[A-Z0-9.=-]+$/;

export class CreateBrokerageBuyDto implements CreateBrokerageBuyRequest {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @Transform(trimOptionalStringValue)
  assetId?: string | null;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(NAME_MAX_LENGTH)
  @Transform(trimOptionalStringValue)
  name?: string | null;

  @IsEnum(PrismaAssetKind)
  kind!: AssetKind;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(TICKER_MAX_LENGTH)
  @Matches(MARKET_SYMBOL_PATTERN)
  @Transform(uppercaseOptionalStringValue)
  ticker?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(EXCHANGE_MAX_LENGTH)
  @Matches(EXCHANGE_PATTERN)
  @Transform(uppercaseOptionalStringValue)
  exchange?: string | null;

  @IsString()
  @Matches(/^[A-Z]{3}$/)
  @Transform(uppercaseOptionalStringValue)
  currency!: string;

  @IsNumber()
  @IsPositive()
  quantity!: number;

  @IsNumber()
  @IsPositive()
  unitPrice!: number;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  feeAmount?: number | null;

  @IsDateString()
  postedAt!: string;

  @IsOptional()
  @IsString()
  @MaxLength(NOTES_MAX_LENGTH)
  @Transform(trimOptionalStringValue)
  notes?: string | null;
}
