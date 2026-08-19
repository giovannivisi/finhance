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
import type { CreateBrokerageDividendRequest } from '@finhance/shared';

function trimOptionalStringValue({ value }: TransformFnParams): unknown {
  return typeof value === 'string' ? value.trim() || undefined : value;
}

const NOTES_MAX_LENGTH = 2_000;

export class CreateBrokerageDividendDto
  implements CreateBrokerageDividendRequest
{
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @Transform(trimOptionalStringValue)
  assetId?: string | null;

  @IsNumber()
  @IsPositive()
  amount!: number;

  @IsDateString({ strict: true })
  postedAt!: string;

  @IsString()
  @IsNotEmpty()
  @Transform(trimOptionalStringValue)
  categoryId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(NOTES_MAX_LENGTH)
  @Transform(trimOptionalStringValue)
  notes?: string | null;
}
