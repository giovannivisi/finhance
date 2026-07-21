import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { DeleteUserAccountDto } from '@/users/dto/delete-user-account.dto';
import { UpdateUserSettingsDto } from '@/users/dto/update-user-settings.dto';

function collectMessages(errors: ReturnType<typeof validateSync>): string[] {
  return errors.flatMap((error) => Object.values(error.constraints ?? {}));
}

describe('UpdateUserSettingsDto', () => {
  it('rejects unsupported start pages', () => {
    const dto = plainToInstance(UpdateUserSettingsDto, {
      startPage: 'IMPORT',
    });

    expect(collectMessages(validateSync(dto))).toEqual(
      expect.arrayContaining([
        expect.stringContaining(
          'startPage must be one of the following values',
        ),
      ]),
    );
  });

  it('accepts valid booleans and start-page values', () => {
    const dto = plainToInstance(UpdateUserSettingsDto, {
      showTransactionTimes: false,
      startPage: 'ANALYTICS',
      cloudParserEnabled: true,
      cloudParserConsentVersion: '2026-07-12',
    });

    expect(validateSync(dto)).toEqual([]);
  });
});

describe('DeleteUserAccountDto', () => {
  it('requires a valid confirmation email', () => {
    const dto = plainToInstance(DeleteUserAccountDto, { email: 'not-email' });

    expect(collectMessages(validateSync(dto))).toEqual(
      expect.arrayContaining([
        expect.stringContaining('email must be an email'),
      ]),
    );
  });

  it('accepts a valid confirmation email without normalising it', () => {
    const dto = plainToInstance(DeleteUserAccountDto, {
      email: 'Person@example.com',
    });

    expect(validateSync(dto)).toEqual([]);
    expect(dto.email).toBe('Person@example.com');
  });
});
