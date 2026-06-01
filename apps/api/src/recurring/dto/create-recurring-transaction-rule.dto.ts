import { Transform } from 'class-transformer';
import type { TransformFnParams } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import {
  TransactionDirection as PrismaTransactionDirection,
  TransactionKind as PrismaTransactionKind,
} from '@prisma/client';
import type {
  TransactionDirection,
  TransactionKind,
  UpsertRecurringTransactionRuleRequest,
} from '@finhance/shared';

function trimStringValue({ value }: TransformFnParams): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

function trimOptionalStringValue({ value }: TransformFnParams): unknown {
  return typeof value === 'string' ? value.trim() || undefined : value;
}

const RULE_NAME_MAX_LENGTH = 120;
const RULE_DESCRIPTION_MAX_LENGTH = 240;
const RULE_COUNTERPARTY_MAX_LENGTH = 120;
const RULE_NOTES_MAX_LENGTH = 2_000;

export class CreateRecurringTransactionRuleDto
  implements UpsertRecurringTransactionRuleRequest
{
  @IsString()
  @IsNotEmpty()
  @MaxLength(RULE_NAME_MAX_LENGTH)
  @Transform(trimStringValue)
  name!: string;

  @IsEnum(PrismaTransactionKind)
  kind!: TransactionKind;

  @IsNumber()
  @IsPositive()
  amount!: number;

  @IsInt()
  @Min(1)
  @Max(31)
  dayOfMonth!: number;

  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  @Transform(trimStringValue)
  startDate!: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  @Transform(trimOptionalStringValue)
  endDate?: string | null;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @Transform(trimOptionalStringValue)
  accountId?: string | null;

  @IsOptional()
  @IsEnum(PrismaTransactionDirection)
  direction?: TransactionDirection | null;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @Transform(trimOptionalStringValue)
  categoryId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(RULE_COUNTERPARTY_MAX_LENGTH)
  @Transform(trimOptionalStringValue)
  counterparty?: string | null;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @Transform(trimOptionalStringValue)
  sourceAccountId?: string | null;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @Transform(trimOptionalStringValue)
  destinationAccountId?: string | null;

  @IsString()
  @IsNotEmpty()
  @MaxLength(RULE_DESCRIPTION_MAX_LENGTH)
  @Transform(trimStringValue)
  description!: string;

  @IsOptional()
  @IsString()
  @MaxLength(RULE_NOTES_MAX_LENGTH)
  @Transform(trimOptionalStringValue)
  notes?: string | null;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
