import { Transform } from 'class-transformer';
import type { TransformFnParams } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import {
  AssetKind as PrismaAssetKind,
  InvestmentPlanCadence as PrismaInvestmentPlanCadence,
} from '@finhance/db';
import {
  IsSupportedCurrencyCode,
  IsSupportedExchangeValue,
} from '@/common/catalog-validators';
import type {
  AssetKind,
  CreateInvestmentPlanRequest,
  InvestmentPlanCadence,
} from '@finhance/shared';

function trimStringValue({ value }: TransformFnParams): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

function trimOptionalStringValue({ value }: TransformFnParams): unknown {
  return typeof value === 'string' ? value.trim() || undefined : value;
}

function uppercaseStringValue({ value }: TransformFnParams): unknown {
  return typeof value === 'string' ? value.trim().toUpperCase() : value;
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

export class CreateInvestmentPlanDto implements CreateInvestmentPlanRequest {
  @IsString()
  @IsNotEmpty()
  @Transform(trimStringValue)
  accountId!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(NAME_MAX_LENGTH)
  @Transform(trimStringValue)
  name!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(NAME_MAX_LENGTH)
  @Transform(trimStringValue)
  securityName!: string;

  @IsEnum(PrismaAssetKind)
  securityKind!: AssetKind;

  @IsString()
  @IsNotEmpty()
  @MaxLength(TICKER_MAX_LENGTH)
  @Matches(MARKET_SYMBOL_PATTERN)
  @Transform(uppercaseStringValue)
  securityTicker!: string;

  @IsOptional()
  @IsString()
  @MaxLength(EXCHANGE_MAX_LENGTH)
  @IsSupportedExchangeValue(
    (input) => (input as CreateInvestmentPlanDto).securityKind,
  )
  @Transform(uppercaseOptionalStringValue)
  securityExchange?: string | null;

  @IsString()
  @IsSupportedCurrencyCode()
  @Transform(uppercaseStringValue)
  currency!: string;

  @IsNumber()
  @IsPositive()
  contributionAmount!: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  estimatedFeeAmount?: number | null;

  @IsEnum(PrismaInvestmentPlanCadence)
  cadence!: InvestmentPlanCadence;

  @IsInt()
  @Min(1)
  @Max(31)
  dayOfMonth!: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(31)
  secondDayOfMonth?: number | null;

  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  @Transform(trimStringValue)
  nextScheduledDate!: string;

  @IsOptional()
  @IsString()
  @MaxLength(NOTES_MAX_LENGTH)
  @Transform(trimOptionalStringValue)
  notes?: string | null;
}
