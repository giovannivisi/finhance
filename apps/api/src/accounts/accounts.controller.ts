import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { AccountsService } from '@accounts/accounts.service';
import { CreateAccountDto } from '@accounts/dto/create-account.dto';
import { UpdateAccountDto } from '@accounts/dto/update-account.dto';
import { toAccountResponse } from '@accounts/accounts.mapper';
import { RequestOwnerResolver } from '@/security/request-owner.resolver';
import type { AccountResponse } from '@finhance/shared';

@Controller('accounts')
export class AccountsController {
  constructor(
    private readonly accountsService: AccountsService,
    private readonly requestOwnerResolver: RequestOwnerResolver,
  ) {}

  private resolveOwnerId(): string {
    return this.requestOwnerResolver.resolveOwnerId();
  }

  @Get()
  async findAll(
    @Query('includeArchived') includeArchived?: string,
  ): Promise<AccountResponse[]> {
    const accounts = await this.accountsService.findAll(this.resolveOwnerId(), {
      includeArchived: includeArchived === 'true',
    });
    return accounts.map(toAccountResponse);
  }

  @Post()
  async create(@Body() dto: CreateAccountDto): Promise<AccountResponse> {
    const account = await this.accountsService.create(
      this.resolveOwnerId(),
      dto,
    );
    return toAccountResponse(account);
  }

  @Get(':id')
  async findOne(@Param('id') id: string): Promise<AccountResponse> {
    const account = await this.accountsService.findOne(
      this.resolveOwnerId(),
      id,
    );
    return toAccountResponse(account);
  }

  @Put(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateAccountDto,
  ): Promise<AccountResponse> {
    const account = await this.accountsService.update(
      this.resolveOwnerId(),
      id,
      dto,
    );
    return toAccountResponse(account);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@Param('id') id: string): Promise<void> {
    return this.accountsService.remove(this.resolveOwnerId(), id);
  }
}
