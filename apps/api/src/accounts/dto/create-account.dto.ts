import { IsEnum, IsNotEmpty, IsNumber, IsOptional, IsString } from 'class-validator';
import { AccountType } from '@prisma/client';

export class CreateAccountDto {
  @IsOptional()
  @IsString()
  userId?: string;

  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsEnum(AccountType)
  type!: AccountType; // "ASSET" | "LIABILITY"

  @IsNumber()
  balance!: number;

  @IsOptional()
  @IsString()
  currency?: string; // default handled by Prisma as "EUR"

  @IsOptional()
  @IsString()
  categoryId?: string;
}