import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
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
        expect.stringContaining('startPage must be one of the following values'),
      ]),
    );
  });

  it('accepts valid booleans and start-page values', () => {
    const dto = plainToInstance(UpdateUserSettingsDto, {
      showTransactionTimes: false,
      startPage: 'ANALYTICS',
    });

    expect(validateSync(dto)).toEqual([]);
  });
});
