import { Transform } from 'class-transformer';
import type { TransformFnParams } from 'class-transformer';
import { IsIn, IsNotEmpty, IsString, MaxLength } from 'class-validator';
import type {
  AiTransactionDraftSource,
  CreateAiTransactionDraftRequest,
} from '@finhance/shared';
import { DEFAULT_AI_INPUT_LIMIT_CHARACTERS } from '@/ai/ai.config';

const DRAFT_SOURCE_VALUES = ['freeform', 'receipt'] as const;

function trimStringValue({ value }: TransformFnParams): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

export class CreateTransactionDraftDto
  implements CreateAiTransactionDraftRequest
{
  @IsString()
  @IsNotEmpty()
  @MaxLength(DEFAULT_AI_INPUT_LIMIT_CHARACTERS)
  @Transform(trimStringValue)
  text!: string;

  @IsIn(DRAFT_SOURCE_VALUES)
  source!: AiTransactionDraftSource;
}
