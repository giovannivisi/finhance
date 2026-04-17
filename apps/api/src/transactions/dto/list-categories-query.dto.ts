import { Transform } from 'class-transformer';
import type { TransformFnParams } from 'class-transformer';
import { IsBoolean, IsOptional } from 'class-validator';

function booleanValue({ value }: TransformFnParams): unknown {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'string') {
    return value.trim().toLowerCase() === 'true';
  }

  return value;
}

export class ListCategoriesQueryDto {
  @IsOptional()
  @Transform(booleanValue)
  @IsBoolean()
  includeArchived?: boolean;
}
