import { Transform } from 'class-transformer';
import type { TransformFnParams } from 'class-transformer';
import { IsBoolean, IsIn, IsOptional } from 'class-validator';
import type { UpdateUserSettingsRequest, UserStartPage } from '@finhance/shared';
import { USER_START_PAGE_VALUES } from '@/users/users.settings';

function trimOptionalStringValue({ value }: TransformFnParams): unknown {
  return typeof value === 'string' ? value.trim() || undefined : value;
}

function booleanValue({ value }: TransformFnParams): unknown {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true') {
      return true;
    }

    if (normalized === 'false') {
      return false;
    }
  }

  return value;
}

export class UpdateUserSettingsDto implements UpdateUserSettingsRequest {
  @IsOptional()
  @Transform(booleanValue)
  @IsBoolean()
  showTransactionTimes?: boolean;

  @IsOptional()
  @Transform(trimOptionalStringValue)
  @IsIn(USER_START_PAGE_VALUES)
  startPage?: UserStartPage;
}
