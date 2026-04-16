import {
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  Matches,
  IsString,
  IsPositive,
  ValidateIf,
} from "class-validator";
import { Transform } from 'class-transformer';
import { AssetType, AssetKind, LiabilityKind } from "@prisma/client";

export class CreateAssetDto {
  @IsOptional()
  @IsString()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim() || undefined : value,
  )
  userId?: string;

  @IsString()
  @IsNotEmpty()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  name!: string;

  // Existing
  @IsEnum(AssetType)
  type!: AssetType; // ASSET | LIABILITY

  @ValidateIf(a => a.type === "LIABILITY")
  @IsEnum(LiabilityKind)
  liabilityKind?: LiabilityKind;

  @ValidateIf(a => a.type === "ASSET")
  @IsEnum(AssetKind)
  kind?: AssetKind;

  @ValidateIf(a =>
  a.type === "LIABILITY" ||
  (a.type === "ASSET" && !["STOCK","BOND","CRYPTO"].includes(a.kind))
  )
  @IsNumber()
  @IsPositive()
  balance?: number;

  @IsOptional()
  @IsString()
  @Matches(/^[A-Z]{3}$/)
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  currency?: string;

  @ValidateIf(a => a.type === "ASSET" && ["STOCK","BOND","CRYPTO"].includes(a.kind))
  @IsString()
  @IsNotEmpty()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  ticker?: string;

  @ValidateIf(a => a.type === "ASSET" && ["STOCK","BOND","CRYPTO"].includes(a.kind))
  @IsString()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  exchange?: string;

  @ValidateIf(a => a.type === "ASSET" && ["STOCK", "BOND", "CRYPTO"].includes(a.kind))
  @IsNumber()
  @IsPositive()
  quantity?: number;

  @ValidateIf(a => a.type === "ASSET" && ["STOCK", "BOND", "CRYPTO"].includes(a.kind))
  @IsNumber()
  @IsPositive()
  unitPrice?: number;

  @IsOptional()
  @IsString()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim() || undefined : value,
  )
  notes?: string;

  @IsOptional()
  @IsNumber()
  order?: number;
}
