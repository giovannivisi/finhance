import { IsEnum, IsNotEmpty, IsNumber, IsOptional, IsString } from 'class-validator';
import { AssetType } from '@prisma/client';

export class CreateAssetDto {
  @IsOptional()
  @IsString()
  userId?: string;

  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsEnum(AssetType)
  type!: AssetType; // "ASSET" | "LIABILITY"

  @IsNumber()
  balance!: number;

  @IsOptional()
  @IsString()
  currency?: string; // default handled by Prisma as "EUR"

  @IsOptional()
  @IsString()
  categoryId?: string;
}