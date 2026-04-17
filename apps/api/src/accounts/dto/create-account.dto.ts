import { Transform } from 'class-transformer';
import type { TransformFnParams } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsNotEmpty,
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

export class CreateAccountDto implements UpsertAccountRequest {
  @IsString()
  @IsNotEmpty()
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
  @Transform(trimOptionalStringValue)
  institution?: string | null;

  @IsOptional()
  @IsString()
  @Transform(trimOptionalStringValue)
  notes?: string | null;

  @IsOptional()
  @IsInt()
  order?: number | null;
}
