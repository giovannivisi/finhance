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

export class CreateAssetDto implements UpsertAssetRequest {
  @IsString()
  @IsNotEmpty()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  name!: string;

  @IsEnum(PrismaAssetType)
  type!: AssetType;

  @ValidateIf((a) => a.type === 'LIABILITY')
  @IsEnum(PrismaLiabilityKind)
  liabilityKind?: LiabilityKind | null;

  @ValidateIf((a) => a.type === 'ASSET')
  @IsEnum(PrismaAssetKind)
  kind?: AssetKind | null;

  @ValidateIf(
    (a) =>
      a.type === 'LIABILITY' ||
      (a.type === 'ASSET' && !['STOCK', 'BOND', 'CRYPTO'].includes(a.kind)),
  )
  @IsNumber()
  @IsPositive()
  balance?: number | null;

  @IsOptional()
  @IsString()
  @Matches(/^[A-Z]{3}$/)
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  currency?: string;

  @ValidateIf(
    (a) => a.type === 'ASSET' && ['STOCK', 'BOND', 'CRYPTO'].includes(a.kind),
  )
  @IsString()
  @IsNotEmpty()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  ticker?: string | null;

  @ValidateIf(
    (a) => a.type === 'ASSET' && ['STOCK', 'BOND', 'CRYPTO'].includes(a.kind),
  )
  @IsString()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  exchange?: string | null;

  @ValidateIf(
    (a) => a.type === 'ASSET' && ['STOCK', 'BOND', 'CRYPTO'].includes(a.kind),
  )
  @IsNumber()
  @IsPositive()
  quantity?: number | null;

  @ValidateIf(
    (a) => a.type === 'ASSET' && ['STOCK', 'BOND', 'CRYPTO'].includes(a.kind),
  )
  @IsNumber()
  @IsPositive()
  unitPrice?: number | null;

  @IsOptional()
  @IsString()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim() || undefined : value,
  )
  notes?: string | null;

  @IsOptional()
  @IsNumber()
  order?: number | null;
}
