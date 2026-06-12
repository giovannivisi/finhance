import { Transform, Type } from 'class-transformer';
import type { TransformFnParams } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { AssetKind as PrismaAssetKind } from '@finhance/db';
import type {
  AssetKind,
  PortfolioAssetKindTargetInput,
  PortfolioSecurityTargetInput,
  UpdatePortfolioAllocationTargetsRequest,
} from '@finhance/shared';

function uppercaseOptionalStringValue({ value }: TransformFnParams): unknown {
  return typeof value === 'string'
    ? value.trim().toUpperCase() || undefined
    : value;
}

function trimOptionalStringValue({ value }: TransformFnParams): unknown {
  return typeof value === 'string' ? value.trim() || undefined : value;
}

const EXCHANGE_MAX_LENGTH = 24;
const EXCHANGE_PATTERN = /^[A-Z0-9.=-]+$/;

class PortfolioAssetKindTargetInputDto
  implements PortfolioAssetKindTargetInput
{
  @IsEnum(PrismaAssetKind)
  kind!: AssetKind;

  @IsNumber()
  @Min(0)
  targetPercent!: number;
}

class PortfolioSecurityTargetInputDto implements PortfolioSecurityTargetInput {
  @IsEnum(PrismaAssetKind)
  kind!: AssetKind;

  @IsString()
  @Matches(/^[A-Z0-9.=-]{1,32}$/)
  @Transform(uppercaseOptionalStringValue)
  ticker!: string;

  @IsOptional()
  @IsString()
  @MaxLength(EXCHANGE_MAX_LENGTH)
  @Matches(EXCHANGE_PATTERN)
  @Transform(uppercaseOptionalStringValue)
  exchange?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  @Transform(trimOptionalStringValue)
  name?: string | null;

  @IsNumber()
  @Min(0)
  targetPercent!: number;
}

export class UpdatePortfolioAllocationTargetsDto
  implements UpdatePortfolioAllocationTargetsRequest
{
  @IsArray()
  @ArrayMaxSize(32)
  @ValidateNested({ each: true })
  @Type(() => PortfolioAssetKindTargetInputDto)
  assetKindTargets!: PortfolioAssetKindTargetInput[];

  @IsArray()
  @ArrayMaxSize(256)
  @ValidateNested({ each: true })
  @Type(() => PortfolioSecurityTargetInputDto)
  securityTargets!: PortfolioSecurityTargetInput[];
}
