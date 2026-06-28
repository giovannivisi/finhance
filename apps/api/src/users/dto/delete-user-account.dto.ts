import { IsEmail, IsNotEmpty, IsString } from 'class-validator';
import type { DeleteUserAccountRequest } from '@finhance/shared';

export class DeleteUserAccountDto implements DeleteUserAccountRequest {
  @IsString()
  @IsNotEmpty()
  @IsEmail()
  email!: string;
}
