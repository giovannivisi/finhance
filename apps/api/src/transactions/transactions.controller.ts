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
import { toAccountResponse } from '@accounts/accounts.mapper';
import { RequestOwnerResolver } from '@/security/request-owner.resolver';
import { toCategoryResponse } from '@transactions/categories.mapper';
import { CreateTransactionDto } from '@transactions/dto/create-transaction.dto';
import { ExpenseValidationService } from '@transactions/expense-validation.service';
import { toExpenseValidationRuleResponse } from '@transactions/expense-validation.mapper';
import { FindTransactionsQueryDto } from '@transactions/dto/find-transactions-query.dto';
import { UpdateTransactionDto } from '@transactions/dto/update-transaction.dto';
import { CategoriesService } from '@transactions/categories.service';
import { toTransactionResponse } from '@transactions/transactions.mapper';
import { TransactionsService } from '@transactions/transactions.service';
import type {
  TransactionResponse,
  TransactionsPageDataResponse,
} from '@finhance/shared';

@Controller('transactions')
export class TransactionsController {
  constructor(
    private readonly transactionsService: TransactionsService,
    private readonly accountsService: AccountsService,
    private readonly categoriesService: CategoriesService,
    private readonly expenseValidationService: ExpenseValidationService,
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

  @Get('page-data')
  async getPageData(
    @Query() query: FindTransactionsQueryDto,
  ): Promise<TransactionsPageDataResponse> {
    const ownerId = this.resolveOwnerId();
    const [
      transactions,
      cashflow,
      accounts,
      categories,
      expenseValidationRules,
    ] = await Promise.all([
      this.transactionsService.findAll(ownerId, query),
      this.transactionsService.getCashflowSummary(ownerId, query),
      this.accountsService.findAll(ownerId, { includeArchived: true }),
      this.categoriesService.findAll(ownerId, { includeArchived: true }),
      this.expenseValidationService.list(ownerId),
    ]);
    const [accountDeletionStates, categoryDeletionStates] = await Promise.all([
      this.accountsService.getDeletionStates(
        ownerId,
        accounts.map((account) => account.id),
      ),
      this.categoriesService.getDeletionStates(
        ownerId,
        categories.map((category) => category.id),
      ),
    ]);

    return {
      transactions: transactions.map(toTransactionResponse),
      cashflow,
      accounts: accounts.map((account) =>
        toAccountResponse(account, accountDeletionStates.get(account.id)),
      ),
      categories: categories.map((category) =>
        toCategoryResponse(category, categoryDeletionStates.get(category.id)),
      ),
      expenseValidationRules: expenseValidationRules.map(
        toExpenseValidationRuleResponse,
      ),
    };
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
