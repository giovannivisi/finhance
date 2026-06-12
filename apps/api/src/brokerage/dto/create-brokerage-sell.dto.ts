import { Transform } from 'class-transformer';
import type { TransformFnParams } from 'class-transformer';
import {
  IsDateString,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength,
} from 'class-validator';
import type { CreateBrokerageSellRequest } from '@finhance/shared';

function trimOptionalStringValue({ value }: TransformFnParams): unknown {
  return typeof value === 'string' ? value.trim() || undefined : value;
}

const NOTES_MAX_LENGTH = 2_000;

export class CreateBrokerageSellDto implements CreateBrokerageSellRequest {
  @IsString()
  @IsNotEmpty()
  @Transform(trimOptionalStringValue)
  assetId!: string;

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
