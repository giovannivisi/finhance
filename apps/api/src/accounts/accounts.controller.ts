import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { Patch } from '@nestjs/common/decorators';
import { AccountsService } from '@accounts/accounts.service';
import { CreateAccountDto } from '@accounts/dto/create-account.dto';
import { UpdateAccountDto } from '@accounts/dto/update-account.dto';
import { Account } from '@prisma/client';

@Controller('accounts')
export class AccountsController {
  constructor(private readonly accountsService: AccountsService) {}

  @Get()
  async findAll(): Promise<Account[]> {
    return this.accountsService.findAll();
  }

  @Post()
  async create(@Body() dto: CreateAccountDto): Promise<Account> {
    return this.accountsService.create(dto);
  }

  @Delete(':id')
  async remove(@Param('id') id: string): Promise<void> {
    return this.accountsService.remove(id);
  }

  @Get('summary')
  async getSummary() {
    return this.accountsService.getSummary();
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.accountsService.findOne(id);
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateAccountDto) {
    return this.accountsService.update(id, dto);
  }
}