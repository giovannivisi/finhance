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
    const deletionStates = await this.accountsService.getDeletionStates(
      this.resolveOwnerId(),
      accounts.map((account) => account.id),
    );
    return accounts.map((account) =>
      toAccountResponse(account, deletionStates.get(account.id)),
    );
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
    const deletionState = (
      await this.accountsService.getDeletionStates(this.resolveOwnerId(), [
        account.id,
      ])
    ).get(account.id);
    return toAccountResponse(account, deletionState);
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

  @Post(':id/opening-balance-baseline')
  async establishOpeningBalanceBaseline(
    @Param('id') id: string,
  ): Promise<AccountResponse> {
    const account = await this.accountsService.establishOpeningBalanceBaseline(
      this.resolveOwnerId(),
      id,
    );
    const deletionState = (
      await this.accountsService.getDeletionStates(this.resolveOwnerId(), [id])
    ).get(id);
    return toAccountResponse(account, deletionState);
  }

  @Post(':id/unarchive')
  async unarchive(@Param('id') id: string): Promise<AccountResponse> {
    const account = await this.accountsService.unarchive(
      this.resolveOwnerId(),
      id,
    );
    const deletionState = (
      await this.accountsService.getDeletionStates(this.resolveOwnerId(), [id])
    ).get(id);
    return toAccountResponse(account, deletionState);
  }

  @Get(':id')
  async findOne(@Param('id') id: string): Promise<AccountResponse> {
    const account = await this.accountsService.findOne(
      this.resolveOwnerId(),
      id,
    );
    const deletionState = (
      await this.accountsService.getDeletionStates(this.resolveOwnerId(), [id])
    ).get(id);
    return toAccountResponse(account, deletionState);
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
    const deletionState = (
      await this.accountsService.getDeletionStates(this.resolveOwnerId(), [id])
    ).get(id);
    return toAccountResponse(account, deletionState);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@Param('id') id: string): Promise<void> {
    return this.accountsService.remove(this.resolveOwnerId(), id);
  }

  @Delete(':id/permanent')
  @HttpCode(204)
  async permanentlyDelete(@Param('id') id: string): Promise<void> {
    return this.accountsService.permanentlyDelete(this.resolveOwnerId(), id);
  }
}
