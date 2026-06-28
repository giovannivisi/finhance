import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
} from '@nestjs/common';
import type {
  UpdateUserSettingsRequest,
  UserSettingsResponse,
} from '@finhance/shared';
import { RequestOwnerResolver } from '@/security/request-owner.resolver';
import { DeleteUserAccountDto } from '@/users/dto/delete-user-account.dto';
import { UpdateUserSettingsDto } from '@/users/dto/update-user-settings.dto';
import { UsersService } from '@/users/users.service';

@Controller('users/me')
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly requestOwnerResolver: RequestOwnerResolver,
  ) {}

  private resolveOwnerId(): string {
    return this.requestOwnerResolver.resolveOwnerId();
  }

  @Get('settings')
  async getSettings(): Promise<UserSettingsResponse> {
    return this.usersService.getSettings(this.resolveOwnerId());
  }

  @Patch('settings')
  async updateSettings(
    @Body() dto: UpdateUserSettingsDto,
  ): Promise<UserSettingsResponse> {
    return this.usersService.updateSettings(
      this.resolveOwnerId(),
      dto as UpdateUserSettingsRequest,
    );
  }

  @Delete()
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteAccount(@Body() dto: DeleteUserAccountDto): Promise<void> {
    await this.usersService.deleteAccount(this.resolveOwnerId(), dto.email);
  }
}
