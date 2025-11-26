import { Injectable } from '@nestjs/common';
import { PrismaService } from '@prisma/prisma.service';
import { CreateAccountDto } from '@accounts/dto/create-account.dto';
import { UpdateAccountDto } from '@accounts/dto/update-account.dto';
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

  async getSummary() {
    const accounts = await this.prisma.account.findMany();

    let assets = 0;
    let liabilities = 0;

    for (const acc of accounts) {
      if (acc.type === 'ASSET') {
        assets += Number(acc.balance);
      } else if (acc.type === 'LIABILITY') {
        liabilities += Number(acc.balance);
      }
    }

    const netWorth = assets - liabilities;

    return {
      assets,
      liabilities,
      netWorth,
    };
  }

async findOne(id: string) {
  return this.prisma.account.findUnique({
    where: { id },
  });
}

async update(id: string, dto: UpdateAccountDto) {
  return this.prisma.account.update({
    where: { id },
    data: dto,
  });
}
}