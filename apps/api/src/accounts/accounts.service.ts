import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '@prisma/prisma.service';
import { PricesService } from '@prices/prices.service';
import { CreateAccountDto } from '@accounts/dto/create-account.dto';
import { UpdateAccountDto } from '@accounts/dto/update-account.dto';
import { Account, AccountType, Prisma } from '@prisma/client';

interface PreparedAccountInput {
  userId: string;
  name: string;
  type: AccountType;
  currency: string;
  institution: string | null;
  notes: string | null;
  order: number | null;
}

type AccountTransactionClient = Prisma.TransactionClient;

@Injectable()
export class AccountsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pricesService: PricesService,
  ) {}

  async findAll(
    ownerId: string,
    options?: { includeArchived?: boolean },
  ): Promise<Account[]> {
    const includeArchived = options?.includeArchived ?? false;
    const accounts = await this.prisma.account.findMany({
      where: {
        userId: ownerId,
        ...(includeArchived ? {} : { archivedAt: null }),
      },
      orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
    });

    if (!includeArchived) {
      return accounts;
    }

    return accounts.sort((left, right) => {
      if (left.archivedAt && !right.archivedAt) {
        return 1;
      }

      if (!left.archivedAt && right.archivedAt) {
        return -1;
      }

      if (left.order !== right.order) {
        return left.order - right.order;
      }

      return left.createdAt.getTime() - right.createdAt.getTime();
    });
  }

  async findOne(ownerId: string, id: string): Promise<Account> {
    const account = await this.prisma.account.findFirst({
      where: { id, userId: ownerId },
    });

    if (!account) {
      throw new NotFoundException(`Account ${id} was not found.`);
    }

    return account;
  }

  async create(ownerId: string, dto: CreateAccountDto): Promise<Account> {
    const prepared = this.prepareAccountInput(ownerId, dto);

    return this.prisma.$transaction(async (tx) => {
      const activeAccounts = await this.findActiveOrderedAccounts(tx, ownerId);
      const targetOrder = this.clampOrder(
        prepared.order,
        activeAccounts.length,
      );
      const account = await tx.account.create({
        data: {
          userId: prepared.userId,
          name: prepared.name,
          type: prepared.type,
          currency: prepared.currency,
          institution: prepared.institution,
          notes: prepared.notes,
          order: activeAccounts.length,
        },
      });

      const reorderedIds = activeAccounts.map(
        (activeAccount) => activeAccount.id,
      );
      reorderedIds.splice(targetOrder, 0, account.id);
      await this.applyActiveOrder(
        tx,
        [...activeAccounts, account],
        reorderedIds,
      );

      return this.getRequiredAccount(tx, ownerId, account.id);
    });
  }

  async update(
    ownerId: string,
    id: string,
    dto: UpdateAccountDto,
  ): Promise<Account> {
    const prepared = this.prepareAccountInput(ownerId, dto);

    return this.prisma.$transaction(async (tx) => {
      const existing = await this.getRequiredAccount(tx, ownerId, id);

      await tx.account.update({
        where: { id },
        data: {
          name: prepared.name,
          type: prepared.type,
          currency: prepared.currency,
          institution: prepared.institution,
          notes: prepared.notes,
          ...(existing.archivedAt
            ? {
                order:
                  prepared.order === null
                    ? existing.order
                    : Math.max(0, Math.trunc(prepared.order)),
              }
            : {}),
        },
      });

      if (!existing.archivedAt) {
        const activeAccounts = await this.findActiveOrderedAccounts(
          tx,
          ownerId,
        );
        const reorderedIds = activeAccounts
          .map((activeAccount) => activeAccount.id)
          .filter((accountId) => accountId !== id);
        const currentIndex = activeAccounts.findIndex(
          (activeAccount) => activeAccount.id === id,
        );
        const targetOrder = this.clampOrder(
          prepared.order ?? currentIndex,
          reorderedIds.length,
        );

        reorderedIds.splice(targetOrder, 0, id);
        await this.applyActiveOrder(tx, activeAccounts, reorderedIds);
      }

      return this.getRequiredAccount(tx, ownerId, id);
    });
  }

  async remove(ownerId: string, id: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const existing = await this.getRequiredAccount(tx, ownerId, id);

      if (existing.archivedAt) {
        return;
      }

      const activeAccounts = await this.findActiveOrderedAccounts(tx, ownerId);
      const reorderedIds = activeAccounts
        .map((activeAccount) => activeAccount.id)
        .filter((accountId) => accountId !== id);

      await tx.account.update({
        where: { id },
        data: { archivedAt: new Date() },
      });
      await this.applyActiveOrder(tx, activeAccounts, reorderedIds);
    });
  }

  async assertAccountAssignmentAllowed(
    ownerId: string,
    accountId: string | null,
    currentAccountId?: string | null,
  ): Promise<void> {
    if (!accountId) {
      return;
    }

    const account = await this.prisma.account.findFirst({
      where: { id: accountId, userId: ownerId },
    });

    if (!account) {
      throw new BadRequestException(`Account ${accountId} is invalid.`);
    }

    if (account.archivedAt && account.id !== currentAccountId) {
      throw new BadRequestException(
        'Archived accounts cannot be newly assigned to assets.',
      );
    }
  }

  private prepareAccountInput(
    ownerId: string,
    dto: CreateAccountDto | UpdateAccountDto,
  ): PreparedAccountInput {
    return {
      userId: ownerId,
      name: dto.name.trim(),
      type: dto.type,
      currency: this.pricesService.normalizeCurrency(dto.currency ?? 'EUR'),
      institution: dto.institution ?? null,
      notes: dto.notes ?? null,
      order:
        dto.order === null || dto.order === undefined
          ? null
          : Math.trunc(dto.order),
    };
  }

  private async findActiveOrderedAccounts(
    tx: AccountTransactionClient,
    ownerId: string,
  ): Promise<Account[]> {
    return tx.account.findMany({
      where: {
        userId: ownerId,
        archivedAt: null,
      },
      orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
    });
  }

  private async applyActiveOrder(
    tx: AccountTransactionClient,
    currentAccounts: Account[],
    orderedIds: string[],
  ): Promise<void> {
    const currentOrderById = new Map(
      currentAccounts.map((account) => [account.id, account.order]),
    );

    for (const [index, accountId] of orderedIds.entries()) {
      if (currentOrderById.get(accountId) === index) {
        continue;
      }

      await tx.account.update({
        where: { id: accountId },
        data: { order: index },
      });
    }
  }

  private clampOrder(order: number | null, max: number): number {
    if (order === null || Number.isNaN(order)) {
      return max;
    }

    return Math.min(Math.max(Math.trunc(order), 0), max);
  }

  private async getRequiredAccount(
    tx: AccountTransactionClient,
    ownerId: string,
    id: string,
  ): Promise<Account> {
    const account = await tx.account.findFirst({
      where: { id, userId: ownerId },
    });

    if (!account) {
      throw new NotFoundException(`Account ${id} was not found.`);
    }

    return account;
  }
}
