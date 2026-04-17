import {
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  Matches,
  IsString,
  IsPositive,
  ValidateIf,
} from 'class-validator';
import { Transform } from 'class-transformer';
import type { TransformFnParams } from 'class-transformer';
import {
  AssetKind as PrismaAssetKind,
  AssetType as PrismaAssetType,
  LiabilityKind as PrismaLiabilityKind,
} from '@prisma/client';
import type {
  AssetKind,
  AssetType,
  LiabilityKind,
  UpsertAssetRequest,
} from '@finhance/shared';

type AssetTypeProbe = Pick<CreateAssetDto, 'type'>;
type AssetKindProbe = Pick<CreateAssetDto, 'type' | 'kind'>;

function isMarketKind(kind: AssetKind | null | undefined): boolean {
  return kind === 'STOCK' || kind === 'BOND' || kind === 'CRYPTO';
}

function trimStringValue({ value }: TransformFnParams): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

function trimOptionalStringValue({ value }: TransformFnParams): unknown {
  return typeof value === 'string' ? value.trim() || undefined : value;
}

function uppercaseStringValue({ value }: TransformFnParams): unknown {
  return typeof value === 'string' ? value.trim().toUpperCase() : value;
}

export class CreateAssetDto implements UpsertAssetRequest {
  @IsString()
  @IsNotEmpty()
  @Transform(trimStringValue)
  name!: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @Transform(trimOptionalStringValue)
  accountId?: string | null;

  @IsEnum(PrismaAssetType)
  type!: AssetType;

  @ValidateIf((asset: AssetTypeProbe) => asset.type === 'LIABILITY')
  @IsEnum(PrismaLiabilityKind)
  liabilityKind?: LiabilityKind | null;

  @ValidateIf((asset: AssetTypeProbe) => asset.type === 'ASSET')
  @IsEnum(PrismaAssetKind)
  kind?: AssetKind | null;

  @ValidateIf(
    (asset: AssetKindProbe) =>
      asset.type === 'LIABILITY' ||
      (asset.type === 'ASSET' && !isMarketKind(asset.kind)),
  )
  @IsNumber()
  @IsPositive()
  balance?: number | null;

  @IsOptional()
  @IsString()
  @Matches(/^[A-Z]{3}$/)
  @Transform(uppercaseStringValue)
  currency?: string;

  @ValidateIf(
    (asset: AssetKindProbe) =>
      asset.type === 'ASSET' && isMarketKind(asset.kind),
  )
  @IsString()
  @IsNotEmpty()
  @Transform(uppercaseStringValue)
  ticker?: string | null;

  @ValidateIf(
    (asset: AssetKindProbe) =>
      asset.type === 'ASSET' && isMarketKind(asset.kind),
  )
  @IsString()
  @Transform(uppercaseStringValue)
  exchange?: string | null;

  @ValidateIf(
    (asset: AssetKindProbe) =>
      asset.type === 'ASSET' && isMarketKind(asset.kind),
  )
  @IsNumber()
  @IsPositive()
  quantity?: number | null;

  @ValidateIf(
    (asset: AssetKindProbe) =>
      asset.type === 'ASSET' && isMarketKind(asset.kind),
  )
  @IsNumber()
  @IsPositive()
  unitPrice?: number | null;

  @IsOptional()
  @IsString()
  @Transform(trimOptionalStringValue)
  notes?: string | null;

  @IsOptional()
  @IsNumber()
  order?: number | null;
}
