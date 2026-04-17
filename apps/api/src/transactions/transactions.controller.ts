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
import { RequestOwnerResolver } from '@/security/request-owner.resolver';
import { CreateTransactionDto } from '@transactions/dto/create-transaction.dto';
import { FindTransactionsQueryDto } from '@transactions/dto/find-transactions-query.dto';
import { UpdateTransactionDto } from '@transactions/dto/update-transaction.dto';
import { toTransactionResponse } from '@transactions/transactions.mapper';
import { TransactionsService } from '@transactions/transactions.service';
import type { TransactionResponse } from '@finhance/shared';

@Controller('transactions')
export class TransactionsController {
  constructor(
    private readonly transactionsService: TransactionsService,
    private readonly requestOwnerResolver: RequestOwnerResolver,
  ) {}

  private resolveOwnerId(): string {
    return this.requestOwnerResolver.resolveOwnerId();
  }

  @Get()
  async findAll(
    @Query() query: FindTransactionsQueryDto,
  ): Promise<TransactionResponse[]> {
    const transactions = await this.transactionsService.findAll(
      this.resolveOwnerId(),
      query,
    );
    return transactions.map(toTransactionResponse);
  }

  @Post()
  async create(
    @Body() dto: CreateTransactionDto,
  ): Promise<TransactionResponse> {
    const transaction = await this.transactionsService.create(
      this.resolveOwnerId(),
      dto,
    );
    return toTransactionResponse(transaction);
  }

  @Get(':id')
  async findOne(@Param('id') id: string): Promise<TransactionResponse> {
    const transaction = await this.transactionsService.findOne(
      this.resolveOwnerId(),
      id,
    );
    return toTransactionResponse(transaction);
  }

  @Put(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateTransactionDto,
  ): Promise<TransactionResponse> {
    const transaction = await this.transactionsService.update(
      this.resolveOwnerId(),
      id,
      dto,
    );
    return toTransactionResponse(transaction);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@Param('id') id: string): Promise<void> {
    return this.transactionsService.remove(this.resolveOwnerId(), id);
  }
}
