import { Transform } from 'class-transformer';
import type { TransformFnParams } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsEnum,
  IsNotEmpty,
  IsString,
  MaxLength,
} from 'class-validator';
import { AssetKind as PrismaAssetKind } from '@finhance/db';
import type {
  ReorderAssetKindsRequest,
  ReorderAssetsRequest,
} from '@finhance/shared';

const MAX_REORDERED_ASSETS = 500;
const MAX_ASSET_ID_LENGTH = 128;

function trimStringArray({ value }: TransformFnParams): unknown {
  const input: unknown = value;

  return Array.isArray(input)
    ? input.map((entry: unknown) =>
        typeof entry === 'string' ? entry.trim() : entry,
      )
    : input;
}

function uppercaseStringArray({ value }: TransformFnParams): unknown {
  const input: unknown = value;

  return Array.isArray(input)
    ? input.map((entry: unknown) =>
        typeof entry === 'string' ? entry.trim().toUpperCase() : entry,
      )
    : input;
}

export class ReorderAssetsDto implements ReorderAssetsRequest {
  @IsArray()
  @ArrayMaxSize(MAX_REORDERED_ASSETS)
  @ArrayUnique()
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  @MaxLength(MAX_ASSET_ID_LENGTH, { each: true })
  @Transform(trimStringArray)
  assetIds!: string[];
}

export class ReorderAssetKindsDto implements ReorderAssetKindsRequest {
  @IsArray()
  @ArrayMaxSize(Object.keys(PrismaAssetKind).length)
  @ArrayUnique()
  @IsEnum(PrismaAssetKind, { each: true })
  @Transform(uppercaseStringArray)
  kindOrder!: string[];
}
