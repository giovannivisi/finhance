import { Transform } from 'class-transformer';
import type { TransformFnParams } from 'class-transformer';
import {
  IsDateString,
  Min,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength,
} from 'class-validator';
import type { UpdateBrokerageTradeRequest } from '@finhance/shared';

const NOTES_MAX_LENGTH = 2_000;

function trimOptionalStringValue({ value }: TransformFnParams): unknown {
  return typeof value === 'string' ? value.trim() || undefined : value;
}

export class UpdateBrokerageTradeDto implements UpdateBrokerageTradeRequest {
  @IsNumber()
  @IsPositive()
  quantity!: number;

  @IsNumber()
  @IsPositive()
  unitPrice!: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  feeAmount?: number | null;

  @IsDateString({ strict: true })
  postedAt!: string;

  @IsOptional()
  @IsString()
  @MaxLength(NOTES_MAX_LENGTH)
  @Transform(trimOptionalStringValue)
  notes?: string | null;
}
