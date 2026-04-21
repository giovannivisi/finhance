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
import {
  toAccountReconciliationResponse,
  toAccountResponse,
} from '@accounts/accounts.mapper';
import { RequestOwnerResolver } from '@/security/request-owner.resolver';
import { toTransactionResponse } from '@transactions/transactions.mapper';
import type {
  AccountReconciliationResponse,
  AccountResponse,
  TransactionResponse,
} from '@finhance/shared';

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

  @Get('reconciliation')
  async findReconciliation(
    @Query('includeArchived') includeArchived?: string,
  ): Promise<AccountReconciliationResponse[]> {
    const entries = await this.accountsService.findReconciliation(
      this.resolveOwnerId(),
      {
        includeArchived: includeArchived === 'true',
      },
    );
    return entries.map(toAccountReconciliationResponse);
  }

  @Post()
  async create(@Body() dto: CreateAccountDto): Promise<AccountResponse> {
    const account = await this.accountsService.create(
      this.resolveOwnerId(),
      dto,
    );
    return toAccountResponse(account);
  }

  @Post(':id/reconciliation/adjust')
  async createReconciliationAdjustment(
    @Param('id') id: string,
  ): Promise<TransactionResponse> {
    const transaction =
      await this.accountsService.createReconciliationAdjustment(
        this.resolveOwnerId(),
        id,
      );
    return toTransactionResponse(transaction);
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
