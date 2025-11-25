import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateAccountDto } from './dto/create-account.dto';
import { Account, AccountType } from '@prisma/client';

@Injectable()
export class AccountsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(): Promise<Account[]> {
    return this.prisma.account.findMany({
      orderBy: { createdAt: 'asc' },
    });
  }

  async create(dto: CreateAccountDto): Promise<Account> {
    const { userId, name, type, balance, currency } = dto;

    return this.prisma.account.create({
      data: {
        userId: userId ?? null,
        name,
        type,
        balance,
        currency: currency ?? 'EUR',
      },
    });
  }

  async remove(id: string): Promise<void> {
    await this.prisma.account.delete({ where: { id } });
  }
}