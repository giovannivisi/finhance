import { Transform } from 'class-transformer';
import type { TransformFnParams } from 'class-transformer';
import { IsNotEmpty, IsString } from 'class-validator';
import type { UpsertExpenseValidationRuleRequest } from '@finhance/shared';

function trimStringValue({ value }: TransformFnParams): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

export class CreateExpenseValidationRuleDto
  implements UpsertExpenseValidationRuleRequest
{
  @IsString()
  @IsNotEmpty()
  @Transform(trimStringValue)
  entry!: string;

  @IsString()
  @IsNotEmpty()
  @Transform(trimStringValue)
  secondaryCategoryId!: string;
}
