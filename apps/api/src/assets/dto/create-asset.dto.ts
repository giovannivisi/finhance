import {
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsPositive,
  ValidateIf,
} from "class-validator";
import { AssetType, AssetKind, LiabilityKind } from "@prisma/client";

export class CreateAssetDto {
  @IsOptional()
  @IsString()
  userId?: string;

  @IsString()
  @IsNotEmpty()
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
  currency?: string;

  @ValidateIf(a => a.type === "ASSET" && ["STOCK","BOND","CRYPTO"].includes(a.kind))
  @IsString()
  ticker?: string;

  @ValidateIf(a => a.type === "ASSET" && ["STOCK","BOND","CRYPTO"].includes(a.kind))
  @IsString()
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
  notes?: string;

  @IsOptional()
  @IsNumber()
  order?: number;
}