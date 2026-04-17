import { Transform } from 'class-transformer';
import type { TransformFnParams } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  MaxLength,
  IsOptional,
  IsString,
  Matches,
} from 'class-validator';
import { AccountType as PrismaAccountType } from '@prisma/client';
import type { AccountType, UpsertAccountRequest } from '@finhance/shared';

function trimStringValue({ value }: TransformFnParams): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

function trimOptionalStringValue({ value }: TransformFnParams): unknown {
  return typeof value === 'string' ? value.trim() || undefined : value;
}

function uppercaseStringValue({ value }: TransformFnParams): unknown {
  return typeof value === 'string' ? value.trim().toUpperCase() : value;
}

const ACCOUNT_NAME_MAX_LENGTH = 120;
const ACCOUNT_INSTITUTION_MAX_LENGTH = 120;
const ACCOUNT_NOTES_MAX_LENGTH = 2_000;

export class CreateAccountDto implements UpsertAccountRequest {
  @IsString()
  @IsNotEmpty()
  @MaxLength(ACCOUNT_NAME_MAX_LENGTH)
  @Transform(trimStringValue)
  name!: string;

  @IsEnum(PrismaAccountType)
  type!: AccountType;

  @IsOptional()
  @IsString()
  @Matches(/^[A-Z]{3}$/)
  @Transform(uppercaseStringValue)
  currency?: string;

  @IsOptional()
  @IsString()
  @MaxLength(ACCOUNT_INSTITUTION_MAX_LENGTH)
  @Transform(trimOptionalStringValue)
  institution?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(ACCOUNT_NOTES_MAX_LENGTH)
  @Transform(trimOptionalStringValue)
  notes?: string | null;

  @IsOptional()
  @IsInt()
  order?: number | null;
}
