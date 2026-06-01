import { Body, Controller, Get, Patch } from '@nestjs/common';
import type {
  UpdateUserSettingsRequest,
  UserSettingsResponse,
} from '@finhance/shared';
import { RequestOwnerResolver } from '@/security/request-owner.resolver';
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
}
