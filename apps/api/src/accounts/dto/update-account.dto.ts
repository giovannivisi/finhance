import { PartialType } from '@nestjs/mapped-types';
import { CreateAccountDto } from '@accounts/dto/create-account.dto';

export class UpdateAccountDto extends PartialType(CreateAccountDto) {}