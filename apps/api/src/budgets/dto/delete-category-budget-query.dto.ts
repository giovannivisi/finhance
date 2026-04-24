import { Transform } from 'class-transformer';
import type { TransformFnParams } from 'class-transformer';
import { IsString, Matches } from 'class-validator';

const LOCAL_MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

function trimStringValue({ value }: TransformFnParams): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

export class DeleteCategoryBudgetQueryDto {
  @IsString()
  @Matches(LOCAL_MONTH_PATTERN)
  @Transform(trimStringValue)
  effectiveMonth!: string;
}
