import { Injectable } from '@nestjs/common';
import { PrismaService } from '@prisma/prisma.service';
import { CreateAssetDto } from '@assets/dto/create-asset.dto';
import { UpdateAssetDto } from '@assets/dto/update-asset.dto';
import { Asset, AssetType, Prisma } from '@prisma/client';

@Injectable()
export class AssetsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(): Promise<Asset[]> {
    return this.prisma.asset.findMany({
      orderBy: { createdAt: 'asc' },
    });
  }

  async create(dto: CreateAssetDto): Promise<Asset> {
    const isLiability = dto.type === AssetType.LIABILITY;

    // LIABILITY LOGIC
    if (isLiability) {
      return this.prisma.asset.create({
        data: {
          userId: dto.userId ?? null,
          name: dto.name,
          type: AssetType.LIABILITY,
          liabilityKind: dto.liabilityKind,
          balance: new Prisma.Decimal(dto.balance!),
          currency: dto.currency ?? 'EUR',

          // Null-out asset-only fields
          kind: null,
          ticker: null,
          quantity: null,
          unitPrice: null,

          notes: dto.notes ?? null,
          order: dto.order ?? 0,
          categoryId: dto.categoryId ?? null,
        }
      });
    }

    // ASSET LOGIC
    let computedBalance: number;

    if (["STOCK", "BOND", "CRYPTO"].includes(dto.kind!)) {
      computedBalance = Number(dto.quantity) * Number(dto.unitPrice);
    } else {
      computedBalance = Number(dto.balance);
    }

    return this.prisma.asset.create({
      data: {
        userId: dto.userId ?? null,
        name: dto.name,
        type: AssetType.ASSET,
        kind: dto.kind!,
        liabilityKind: null,
        ticker: dto.ticker ?? null,
        quantity: dto.quantity ? new Prisma.Decimal(dto.quantity) : null,
        unitPrice: dto.unitPrice ? new Prisma.Decimal(dto.unitPrice) : null,
        balance: new Prisma.Decimal(computedBalance),
        currency: dto.currency ?? 'EUR',
        categoryId: dto.categoryId ?? null,
        notes: dto.notes ?? null,
        order: dto.order ?? 0,
      }
    });
  }

  async remove(id: string): Promise<void> {
    await this.prisma.asset.delete({ where: { id } });
  }

  async getSummary() {
    const assets = await this.prisma.asset.findMany();
    let ass = 0;
    let liabilities = 0;

    for (const asset of assets) {
      if (asset.type === 'ASSET') {
        ass += Number(asset.balance);
      } else if (asset.type === 'LIABILITY') {
        liabilities += Number(asset.balance);
      }
    }

    const netWorth = ass - liabilities;

    return {
      assets: ass,
      liabilities,
      netWorth,
    };
  }

async findOne(id: string) {
  return this.prisma.asset.findUnique({
    where: { id },
  });
}

  async update(id: string, dto: UpdateAssetDto) {
    const isLiability = dto.type === AssetType.LIABILITY;

    if (isLiability) {
      return this.prisma.asset.update({
        where: { id },
        data: {
          name: dto.name,
          type: AssetType.LIABILITY,
          liabilityKind: dto.liabilityKind,
          balance: dto.balance!,

          // Null-out asset fields
          kind: null,
          ticker: null,
          quantity: null,
          unitPrice: null,

          notes: dto.notes ?? null,
          order: dto.order ?? 0,
          currency: dto.currency ?? 'EUR',
          categoryId: dto.categoryId ?? null,
        }
      });
    }

    // ASSET UPDATE LOGIC
    let computedBalance: number;

    if (["STOCK", "BOND", "CRYPTO"].includes(dto.kind!)) {
      computedBalance = Number(dto.quantity) * Number(dto.unitPrice);
    } else {
      computedBalance = Number(dto.balance);
    }

    return this.prisma.asset.update({
      where: { id },
      data: {
        name: dto.name,
        type: AssetType.ASSET,
        kind: dto.kind!,
        liabilityKind: null,
        ticker: dto.ticker ?? null,
        quantity: dto.quantity ? dto.quantity : null,
        unitPrice: dto.unitPrice ? dto.unitPrice : null,
        balance: computedBalance,
        notes: dto.notes ?? null,
        order: dto.order ?? 0,
        currency: dto.currency ?? 'EUR',
        categoryId: dto.categoryId ?? null,
      }
    });
  }
}